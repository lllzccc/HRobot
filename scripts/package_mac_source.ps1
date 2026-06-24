[CmdletBinding()]
param(
  [int]$Port = 8767,
  [string]$AppName = "hrobot",
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$PackageRootBase = Join-Path (Split-Path $Root -Parent) "HRobot package"
$ReleaseRoot = Join-Path $PackageRootBase "mac-source\$Version"
$BuildBase = Join-Path $PackageRootBase ".build-temp"
$BuildRoot = Join-Path $BuildBase "mac-source\$Version-$PID"
$StageRoot = Join-Path $BuildRoot "$AppName-mac-source-$Version"
$ZipName = "$AppName-mac-source-$Version.zip"
$BuiltZip = Join-Path $BuildRoot $ZipName
$ZipPath = Join-Path $ReleaseRoot $ZipName

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
  if (Test-Path -LiteralPath $Path) {
    Remove-Item -LiteralPath $Path -Recurse -Force
  }
  New-Item -ItemType Directory -Force -Path $Path | Out-Null
}

function Copy-Tree {
  param([string]$Source, [string]$Destination)
  if (Test-Path -LiteralPath $Source) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  }
}

function Remove-CacheFiles {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { return }
  Get-ChildItem -LiteralPath $Path -Recurse -Directory -Filter "__pycache__" -ErrorAction SilentlyContinue |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Recurse -Force }
  Get-ChildItem -LiteralPath $Path -Recurse -File -ErrorAction SilentlyContinue |
    Where-Object { $_.Extension -in @(".pyc", ".pyo") } |
    ForEach-Object { Remove-Item -LiteralPath $_.FullName -Force }
}

function Write-Utf8NoBom {
  param([string]$Path, [string]$Content)
  New-Item -ItemType Directory -Force -Path (Split-Path $Path -Parent) | Out-Null
  $encoding = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $encoding)
}

function Assert-RequiredPackageFiles {
  param([string]$Path)
  $required = @(
    "server.py",
    "index.html",
    "app_version.json",
    "requirements.txt",
    "app\__init__.py",
    "app\modules\agent_center\store.py",
    "app\modules\talent_review\store.py",
    "static\css\app.css",
    "static\js\app.js",
    "static\modules\talent-review\talent-review.js",
    "assets\fonts\harmonyos-sans-sc\harmonyos-sans-sc.css",
    "start_hrobot.command",
    "start_hrobot.sh"
  )
  $missing = @()
  foreach ($item in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $Path $item))) {
      $missing += $item
    }
  }
  if ($missing.Count -gt 0) {
    throw "Package is missing required files: $($missing -join ', ')"
  }
}

Set-Location $Root
New-Item -ItemType Directory -Force -Path $PackageRootBase, $BuildRoot | Out-Null
Reset-Dir $StageRoot $BuildRoot "temporary build"

foreach ($file in @(
  "server.py",
  "index.html",
  "requirements.txt",
  "AGENTS.md",
  "PRODUCT.md",
  ".gitignore",
  "app_version.json"
)) {
  $source = Join-Path $Root $file
  if (Test-Path -LiteralPath $source) {
    Copy-Item -LiteralPath $source -Destination (Join-Path $StageRoot $file) -Force
  }
}

$readmeSource = Get-ChildItem -LiteralPath $Root -Filter "README_*.md" | Select-Object -First 1
if ($readmeSource) {
  Copy-Item -LiteralPath $readmeSource.FullName -Destination (Join-Path $StageRoot $readmeSource.Name) -Force
}

foreach ($dir in @("app", "assets", "docs", "scripts", "static", "tests")) {
  Copy-Tree (Join-Path $Root $dir) (Join-Path $StageRoot $dir)
}
Remove-CacheFiles $StageRoot

$DataTarget = Join-Path $StageRoot "data"
foreach ($dir in @(
  "review_results",
  "talent_profiles",
  "talent_profile_snapshots",
  "hrbp_profile_splits",
  "permissions",
  "report_generation\skills",
  "report_generation\materials",
  "report_generation\settings",
  "report_generation\reports_md",
  "design_center\posters",
  "exports",
  "backups",
  "uploads"
)) {
  New-Item -ItemType Directory -Force -Path (Join-Path $DataTarget $dir) | Out-Null
}

foreach ($file in @(
  "database-rules.md",
  "review_results\README.md",
  "talent_profiles\README.md",
  "hrbp_profile_splits\README.md",
  "permissions\README.md"
)) {
  $source = Join-Path (Join-Path $Root "data") $file
  if (Test-Path -LiteralPath $source) {
    $destination = Join-Path $DataTarget $file
    New-Item -ItemType Directory -Force -Path (Split-Path $destination -Parent) | Out-Null
    Copy-Item -LiteralPath $source -Destination $destination -Force
  }
}

$settingsSource = Join-Path $Root "data\report_generation\settings"
$settingsTarget = Join-Path $DataTarget "report_generation\settings"
if (Test-Path -LiteralPath $settingsSource) {
  Get-ChildItem -LiteralPath $settingsSource -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $settingsTarget $_.Name) -Force
  }
}

$startScript = @"
#!/bin/bash
set -e
cd "`$(dirname "`$0")"
PYTHON_BIN="python3"
if [ -x ".venv/bin/python" ]; then
  PYTHON_BIN=".venv/bin/python"
fi
"`$PYTHON_BIN" server.py --host 127.0.0.1 --port $Port &
SERVER_PID=`$!
sleep 2
open "http://127.0.0.1:$Port/index.html"
wait `$SERVER_PID
"@
Write-Utf8NoBom -Path (Join-Path $StageRoot "start_hrobot.command") -Content ($startScript + "`n")
Write-Utf8NoBom -Path (Join-Path $StageRoot "start_hrobot.sh") -Content ($startScript + "`n")

$macReadme = @"
# HRobot macOS source package

Version: $Version

1. Install Python 3.10 or newer.
2. Run: python3 -m pip install -r requirements.txt
3. Run: chmod +x start_hrobot.command start_hrobot.sh
4. Double-click start_hrobot.command, or run ./start_hrobot.sh

The local service uses http://127.0.0.1:$Port/index.html.
This source package excludes HR data, secrets, uploads, generated reports, logs, caches, and build artifacts.
"@
Write-Utf8NoBom -Path (Join-Path $StageRoot "README_MAC.md") -Content ($macReadme + "`n")

Assert-RequiredPackageFiles $StageRoot
Compress-Archive -Path (Join-Path $StageRoot "*") -DestinationPath $BuiltZip -Force

Reset-Dir $ReleaseRoot (Join-Path $PackageRootBase "mac-source") "Mac source package"
Copy-Item -LiteralPath $BuiltZip -Destination $ZipPath -Force

Assert-PathUnder $BuildRoot $BuildBase "temporary build"
Remove-Item -LiteralPath $BuildRoot -Recurse -Force
if ((Test-Path -LiteralPath $BuildBase) -and -not (Get-ChildItem -LiteralPath $BuildBase -Recurse -File -Force | Select-Object -First 1)) {
  Remove-Item -LiteralPath $BuildBase -Recurse -Force
}

Write-Host "Created Mac source package:"
Write-Host $ZipPath
