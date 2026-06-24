[CmdletBinding()]
param(
  [switch]$IncludeHrData,
  [int]$Port = 8767,
  [string]$AppName = "Hrobot",
  [string]$DisplayName = "Hrobot",
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PackageRootBase = Join-Path (Split-Path $Root -Parent) "HRobot package"
$ReleaseRoot = Join-Path $PackageRootBase "windows\$Version"
$BuildBase = Join-Path $PackageRootBase ".build-temp"
$BuildRoot = Join-Path $BuildBase "windows\$Version-$PID"
$PyInstallerWork = Join-Path $BuildRoot "pyinstaller"
$AppDistRoot = Join-Path $BuildRoot "dist"
$PackageRoot = Join-Path $BuildRoot "package"
$AppPackageDir = Join-Path $PackageRoot "app"
$PayloadZip = Join-Path $BuildRoot "payload.zip"
$InstallerSource = Join-Path $BuildRoot "windows_installer.py"
$InstallerDist = Join-Path $BuildRoot "installer_dist"
$InstallerFileName = "hrobot-win-$Version.exe"
$BuiltInstallerExe = Join-Path $BuildRoot $InstallerFileName
$PortableDir = Join-Path $ReleaseRoot "portable"
$InstallerExe = Join-Path $ReleaseRoot $InstallerFileName
$ReleaseManifest = Join-Path $ReleaseRoot "release.json"

trap {
  if ($BuildRoot -and (Test-Path -LiteralPath $BuildRoot)) {
    $buildFull = [System.IO.Path]::GetFullPath($BuildRoot)
    $buildBaseFull = [System.IO.Path]::GetFullPath($BuildBase).TrimEnd('\') + '\'
    if ($buildFull.StartsWith($buildBaseFull, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $BuildRoot -Recurse -Force -ErrorAction SilentlyContinue
    }
  }
  throw $_
}

function Assert-PathUnder {
  param([string]$Path, [string]$Parent, [string]$Label)
  $full = [System.IO.Path]::GetFullPath($Path)
  $parentFull = [System.IO.Path]::GetFullPath($Parent).TrimEnd('\') + '\'
  if (-not $full.StartsWith($parentFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify path outside $Label root: $full"
  }
}

function Reset-Dir {
  param([string]$Path, [string]$Parent, [string]$Label)
  Assert-PathUnder $Path $Parent $Label
  if (Test-Path $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-Tree {
  param(
    [string]$Source,
    [string]$Destination
  )
  if (Test-Path $Source) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  }
}

function Invoke-Checked {
  param(
    [string]$FilePath,
    [string[]]$Arguments
  )
  & $FilePath @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$FilePath failed with exit code $LASTEXITCODE"
  }
}

function Assert-RequiredPackageFiles {
  param([string]$Path)
  $required = @(
    "$AppName.exe",
    "index.html",
    "app_version.json",
    "app\__init__.py",
    "app\modules\agent_center\store.py",
    "app\modules\talent_review\store.py",
    "static\css\app.css",
    "static\js\app.js",
    "static\modules\talent-review\talent-review.js",
    "assets\fonts\harmonyos-sans-sc\harmonyos-sans-sc.css"
  )
  $missing = @()
  foreach ($item in $required) {
    if (-not (Test-Path (Join-Path $Path $item))) {
      $missing += $item
    }
  }
  if ($missing.Count -gt 0) {
    throw "Package is missing required files: $($missing -join ', ')"
  }
}

Set-Location $Root
New-Item -ItemType Directory -Force -Path $PackageRootBase, $BuildRoot, $PyInstallerWork | Out-Null

if ($IncludeHrData) {
  throw "Hrobot release packages are code-only. Do not bundle HR data, user settings, uploads, generated outputs, or local secrets."
}

Write-Host "Installing packaging dependencies..."
Invoke-Checked "python" @("-m", "pip", "install", "-r", "requirements.txt")
& python -m PyInstaller --version | Out-Null
if ($LASTEXITCODE -ne 0) {
  Invoke-Checked "python" @("-m", "pip", "install", "pyinstaller")
}

Write-Host "Building app executable..."
if (Test-Path (Join-Path $AppDistRoot $AppName)) {
  Remove-Item -LiteralPath (Join-Path $AppDistRoot $AppName) -Recurse -Force
}
Invoke-Checked "python" @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onedir",
  "--noconsole",
  "--name", $AppName,
  "--distpath", $AppDistRoot,
  "--workpath", $PyInstallerWork,
  "--specpath", $PyInstallerWork,
  "server.py"
)

Reset-Dir $PackageRoot $BuildRoot "temporary build"
Copy-Tree (Join-Path $AppDistRoot $AppName) $AppPackageDir

Write-Host "Copying web assets and runtime folders..."
Copy-Item -LiteralPath (Join-Path $Root "index.html") -Destination (Join-Path $AppPackageDir "index.html") -Force
@{
  name = $DisplayName
  version = $Version
} | ConvertTo-Json -Depth 3 | Set-Content -Path (Join-Path $AppPackageDir "app_version.json") -Encoding UTF8
Copy-Tree (Join-Path $Root "assets") (Join-Path $AppPackageDir "assets")
Copy-Tree (Join-Path $Root "app") (Join-Path $AppPackageDir "app")
Copy-Tree (Join-Path $Root "static") (Join-Path $AppPackageDir "static")
Copy-Tree (Join-Path $Root "scripts") (Join-Path $AppPackageDir "scripts")

$DataTarget = Join-Path $AppPackageDir "data"
New-Item -ItemType Directory -Force -Path $DataTarget | Out-Null

if (-not $IncludeHrData) {
  Write-Host "Creating data skeleton only. User data, settings, uploads, generated outputs, and secrets are never bundled."
  $dirs = @(
    "review_results",
    "talent_profiles",
    "talent_profile_snapshots",
    "hrbp_profile_splits",
    "report_generation",
    "report_generation\skills",
    "report_generation\materials",
    "report_generation\settings",
    "permissions",
    "design_center",
    "design_center\posters"
  )
  foreach ($dir in $dirs) {
    New-Item -ItemType Directory -Force -Path (Join-Path $DataTarget $dir) | Out-Null
  }
  foreach ($file in @(
    "database-rules.md",
    "review_results\README.md",
    "talent_profiles\README.md",
    "hrbp_profile_splits\README.md",
    "permissions\README.md"
  )) {
    $sourceFile = Join-Path (Join-Path $Root "data") $file
    if (Test-Path $sourceFile) {
      $destFile = Join-Path $DataTarget $file
      New-Item -ItemType Directory -Force -Path (Split-Path $destFile -Parent) | Out-Null
      Copy-Item -LiteralPath $sourceFile -Destination $destFile -Force
    }
  }
}

$TaskName = $DisplayName
$WatchdogTaskName = "$DisplayName Watchdog"
$OpenUrl = "http://127.0.0.1:$Port/index.html"
$EnsureScript = @"
`$ErrorActionPreference = "SilentlyContinue"
`$AppExe = Join-Path `$PSScriptRoot "$AppName.exe"
`$Processes = @(Get-CimInstance Win32_Process | Where-Object { `$_.ExecutablePath -eq `$AppExe })
`$PortOpen = `$false
if (`$Processes.Count -gt 0) {
  `$ProcessIds = @(`$Processes | ForEach-Object { `$_.ProcessId })
  `$PortOpen = [bool](Get-NetTCPConnection -State Listen -LocalPort $Port | Where-Object { `$ProcessIds -contains `$_.OwningProcess } | Select-Object -First 1)
}
if (`$Processes.Count -eq 0 -or -not `$PortOpen) {
  `$Processes | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force }
  Start-Process -FilePath `$AppExe -ArgumentList @("--host","0.0.0.0","--port","$Port") -WorkingDirectory `$PSScriptRoot -WindowStyle Hidden
}
"@
$EnsureScript | Set-Content -Path (Join-Path $AppPackageDir "Ensure-HRobot.ps1") -Encoding UTF8

$StartBat = @"
@echo off
chcp 65001 >nul
setlocal
set "APP_DIR=%~dp0"
set "APP_EXE=%APP_DIR%$AppName.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { `$_.ExecutablePath -eq '%APP_EXE%' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force }" >nul 2>nul
start "" "%APP_EXE%" --host 0.0.0.0 --port $Port
timeout /t 2 /nobreak >nul
start "" "$OpenUrl"
"@
$StartBat | Set-Content -Path (Join-Path $AppPackageDir "Start-HRobot.bat") -Encoding ASCII

$OpenBat = @"
@echo off
chcp 65001 >nul
start "" "$OpenUrl"
"@
$OpenBat | Set-Content -Path (Join-Path $AppPackageDir "Open-HRobot.bat") -Encoding ASCII

$RegisterBat = @"
@echo off
chcp 65001 >nul
setlocal
set "APP_EXE=%~dp0$AppName.exe"
schtasks /Create /F /TN "$TaskName" /SC ONLOGON /TR "\"%APP_EXE%\" --host 0.0.0.0 --port $Port"
schtasks /Create /F /TN "$WatchdogTaskName" /SC MINUTE /MO 5 /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"%~dp0Ensure-HRobot.ps1\""
echo Registered startup task: $TaskName
echo Registered watchdog task: $WatchdogTaskName
pause
"@
$RegisterBat | Set-Content -Path (Join-Path $AppPackageDir "Register-Autostart.bat") -Encoding ASCII

$StopBat = @"
@echo off
chcp 65001 >nul
setlocal
set "APP_EXE=%~dp0$AppName.exe"
powershell -NoProfile -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { `$_.ExecutablePath -eq '%APP_EXE%' } | ForEach-Object { Stop-Process -Id `$_.ProcessId -Force }"
"@
$StopBat | Set-Content -Path (Join-Path $AppPackageDir "Stop-HRobot.bat") -Encoding ASCII

$UnregisterBat = @"
@echo off
chcp 65001 >nul
schtasks /Delete /F /TN "$TaskName"
schtasks /Delete /F /TN "$WatchdogTaskName"
echo Removed startup task: $TaskName
echo Removed watchdog task: $WatchdogTaskName
pause
"@
$UnregisterBat | Set-Content -Path (Join-Path $AppPackageDir "Unregister-Autostart.bat") -Encoding ASCII

Assert-RequiredPackageFiles $AppPackageDir

Write-Host "Creating installer payload..."
if (Test-Path $PayloadZip) {
  Remove-Item -LiteralPath $PayloadZip -Force
}
Compress-Archive -Path (Join-Path $PackageRoot "app") -DestinationPath $PayloadZip -Force

$InstallerPython = @"
from __future__ import annotations

import os
import pathlib
import shutil
import subprocess
import sys
import time
import webbrowser
import zipfile

APP_NAME = "$AppName"
DISPLAY_NAME = "$DisplayName"
TASK_NAME = "$TaskName"
WATCHDOG_TASK_NAME = "$WatchdogTaskName"
PORT = "$Port"
OPEN_URL = "http://127.0.0.1:$Port/index.html"


def resource_path(name: str) -> pathlib.Path:
    base = pathlib.Path(getattr(sys, "_MEIPASS", pathlib.Path(__file__).resolve().parent))
    return base / name


def install_dir() -> pathlib.Path:
    return pathlib.Path(os.environ.get("LOCALAPPDATA", pathlib.Path.home())) / APP_NAME


def stop_existing(exe: pathlib.Path) -> None:
    script = (
        "Get-CimInstance Win32_Process | "
        f"Where-Object {{ `$_.ExecutablePath -eq '{str(exe)}' }} | "
        "ForEach-Object { Stop-Process -Id `$_.ProcessId -Force }"
    )
    subprocess.run(["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", script], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def merge_extract(zip_path: pathlib.Path, target: pathlib.Path) -> None:
    target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as archive:
        for item in archive.infolist():
            name = pathlib.PurePosixPath(item.filename)
            parts = name.parts
            if not parts or parts[0] != "app":
                continue
            rel = pathlib.Path(*parts[1:]) if len(parts) > 1 else pathlib.Path()
            if not str(rel):
                continue
            dest = target / rel
            if item.is_dir():
                dest.mkdir(parents=True, exist_ok=True)
                continue
            if rel.parts and rel.parts[0].lower() == "data" and dest.exists():
                continue
            dest.parent.mkdir(parents=True, exist_ok=True)
            with archive.open(item) as src, open(dest, "wb") as out:
                shutil.copyfileobj(src, out)


def register_task(exe: pathlib.Path) -> None:
    task_run = f'"{exe}" --host 0.0.0.0 --port {PORT}'
    subprocess.run(["schtasks", "/Create", "/F", "/TN", TASK_NAME, "/SC", "ONLOGON", "/TR", task_run], check=False)
    watchdog = f'powershell -NoProfile -ExecutionPolicy Bypass -File "{exe.parent / "Ensure-HRobot.ps1"}"'
    subprocess.run(["schtasks", "/Create", "/F", "/TN", WATCHDOG_TASK_NAME, "/SC", "MINUTE", "/MO", "5", "/TR", watchdog], check=False)


def start_app(exe: pathlib.Path) -> None:
    flags = 0
    if hasattr(subprocess, "CREATE_NEW_PROCESS_GROUP"):
        flags |= subprocess.CREATE_NEW_PROCESS_GROUP
    if hasattr(subprocess, "DETACHED_PROCESS"):
        flags |= subprocess.DETACHED_PROCESS
    subprocess.Popen([str(exe), "--host", "0.0.0.0", "--port", PORT], cwd=str(exe.parent), creationflags=flags)


def main() -> int:
    target = install_dir()
    exe = target / f"{APP_NAME}.exe"
    print(f"Installing {DISPLAY_NAME} to: {target}")
    stop_existing(exe)
    merge_extract(resource_path("payload.zip"), target)
    register_task(exe)
    start_app(exe)
    time.sleep(2)
    webbrowser.open(OPEN_URL)
    print("")
    print("Install complete.")
    print(f"Local URL: {OPEN_URL}")
    print("A startup task has been registered for the current Windows user.")
    print("A watchdog task checks every 5 minutes and restarts the app if it is not listening.")
    print("If this computer is shut down, the local service will be offline until Windows starts again.")
    input("Press Enter to exit...")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
"@
$InstallerPython | Set-Content -Path $InstallerSource -Encoding UTF8

Write-Host "Building single-file installer..."
Reset-Dir $InstallerDist $BuildRoot "temporary build"
Invoke-Checked "python" @(
  "-m", "PyInstaller",
  "--noconfirm",
  "--clean",
  "--onefile",
  "--console",
  "--name", "$($AppName)Setup",
  "--distpath", $InstallerDist,
  "--workpath", $PyInstallerWork,
  "--specpath", $PyInstallerWork,
  "--add-data", "$PayloadZip;.",
  $InstallerSource
)

Copy-Item -LiteralPath (Join-Path $InstallerDist "$($AppName)Setup.exe") -Destination $BuiltInstallerExe -Force

$releasePayload = [ordered]@{
  app = $DisplayName
  version = $Version
  installer = $InstallerFileName
  publishedAt = (Get-Date).ToString("s")
  notes = "Hrobot $Version"
}
$builtReleaseManifest = Join-Path $BuildRoot "release.json"
$releasePayload | ConvertTo-Json -Depth 5 | Set-Content -Path $builtReleaseManifest -Encoding UTF8

Write-Host "Publishing versioned Windows release..."
Reset-Dir $ReleaseRoot (Join-Path $PackageRootBase "windows") "Windows package"
Copy-Item -LiteralPath $BuiltInstallerExe -Destination $InstallerExe -Force
Copy-Item -LiteralPath $builtReleaseManifest -Destination $ReleaseManifest -Force
Copy-Tree $AppPackageDir $PortableDir

Assert-PathUnder $BuildRoot $BuildBase "temporary build"
Remove-Item -LiteralPath $BuildRoot -Recurse -Force
if ((Test-Path -LiteralPath $BuildBase) -and -not (Get-ChildItem -LiteralPath $BuildBase -Recurse -File -Force | Select-Object -First 1)) {
  Remove-Item -LiteralPath $BuildBase -Recurse -Force
}

Write-Host ""
Write-Host "Done."
Write-Host "Installer: $InstallerExe"
Write-Host "Release manifest: $ReleaseManifest"
Write-Host "Portable app folder: $PortableDir"
Write-Host "Note: this is a code-only release. User data, settings, uploads, generated outputs, and local secrets were not bundled."
