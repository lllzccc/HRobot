[CmdletBinding()]
param(
  [switch]$IncludeHrData,
  [int]$Port = 8767,
  [string]$AppName = "HRobotTalentNineBox",
  [string]$DisplayName = "HRobot Talent NineBox"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ReleaseRoot = Join-Path $Root "packages\windows"
$BuildRoot = Join-Path $Root "build\windows"
$PyInstallerWork = Join-Path $BuildRoot "pyinstaller"
$AppDistRoot = Join-Path $ReleaseRoot "dist"
$PackageRoot = Join-Path $ReleaseRoot "package"
$AppPackageDir = Join-Path $PackageRoot "app"
$PayloadZip = Join-Path $BuildRoot "payload.zip"
$InstallerSource = Join-Path $BuildRoot "windows_installer.py"
$InstallerDist = Join-Path $ReleaseRoot "installer_dist"
$InstallerExe = Join-Path $ReleaseRoot "$($AppName)Setup.exe"

function Assert-ProjectChild {
  param([string]$Path)
  $full = [System.IO.Path]::GetFullPath($Path)
  $rootFull = [System.IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
  if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to modify path outside project: $full"
  }
}

function Reset-Dir {
  param([string]$Path)
  Assert-ProjectChild $Path
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

Set-Location $Root
New-Item -ItemType Directory -Force -Path $ReleaseRoot, $BuildRoot, $PyInstallerWork | Out-Null

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

Reset-Dir $PackageRoot
Copy-Tree (Join-Path $AppDistRoot $AppName) $AppPackageDir

Write-Host "Copying web assets and runtime folders..."
Copy-Item -LiteralPath (Join-Path $Root "index.html") -Destination (Join-Path $AppPackageDir "index.html") -Force
Copy-Tree (Join-Path $Root "assets") (Join-Path $AppPackageDir "assets")
Copy-Tree (Join-Path $Root "scripts") (Join-Path $AppPackageDir "scripts")

$DataTarget = Join-Path $AppPackageDir "data"
New-Item -ItemType Directory -Force -Path $DataTarget | Out-Null

if ($IncludeHrData) {
  Write-Host "Including HR data. Local caches/uploads/backups are excluded."
  $excludeDirs = @("backups", "exports", "uploads", "__pycache__")
  $excludeFiles = @("intelligence_update_status.json")
  robocopy (Join-Path $Root "data") $DataTarget /E /XD $excludeDirs /XF $excludeFiles | Out-Null
  $code = $LASTEXITCODE
  if ($code -gt 7) {
    throw "robocopy failed with exit code $code"
  }
} else {
  Write-Host "Creating data skeleton only. Run with -IncludeHrData to bundle current HR data."
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
Reset-Dir $InstallerDist
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

Copy-Item -LiteralPath (Join-Path $InstallerDist "$($AppName)Setup.exe") -Destination $InstallerExe -Force

Write-Host ""
Write-Host "Done."
Write-Host "Installer: $InstallerExe"
Write-Host "Portable app folder: $AppPackageDir"
if (-not $IncludeHrData) {
  Write-Host "Note: HR data was not bundled. Re-run with -IncludeHrData if you intentionally want to include current data."
}
