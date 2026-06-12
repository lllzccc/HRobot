[CmdletBinding()]
param(
  [int]$Port = 8767,
  [string]$AppName = "hrobot-talent-ninebox"
)

$ErrorActionPreference = "Stop"

$Root = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$Timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$PackageName = "$AppName-web-source-$Timestamp"
$BuildRoot = Join-Path $Root "build\web-source"
$StageRoot = Join-Path $BuildRoot $PackageName
$PackagesRoot = Join-Path $Root "packages"
$WebPackagesRoot = Join-Path $PackagesRoot "web"
$ZipPath = Join-Path $WebPackagesRoot "$PackageName.zip"

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
  param([string]$Source, [string]$Destination)
  if (Test-Path $Source) {
    New-Item -ItemType Directory -Force -Path (Split-Path $Destination -Parent) | Out-Null
    Copy-Item -LiteralPath $Source -Destination $Destination -Recurse -Force
  }
}

function Remove-CacheFiles {
  param([string]$Path)
  if (-not (Test-Path $Path)) { return }
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

Set-Location $Root
Reset-Dir $StageRoot
New-Item -ItemType Directory -Force -Path $WebPackagesRoot | Out-Null

Copy-Item -LiteralPath (Join-Path $Root "server.py") -Destination (Join-Path $StageRoot "server.py") -Force
Copy-Item -LiteralPath (Join-Path $Root "index.html") -Destination (Join-Path $StageRoot "index.html") -Force
Copy-Item -LiteralPath (Join-Path $Root "requirements.txt") -Destination (Join-Path $StageRoot "requirements.txt") -Force
Copy-Item -LiteralPath (Join-Path $Root "AGENTS.md") -Destination (Join-Path $StageRoot "AGENTS.md") -Force

$readmeSource = Get-ChildItem -LiteralPath $Root -Filter "README_*.md" | Select-Object -First 1
if ($readmeSource) {
  Copy-Item -LiteralPath $readmeSource.FullName -Destination (Join-Path $StageRoot $readmeSource.Name) -Force
}

Copy-Tree (Join-Path $Root "assets") (Join-Path $StageRoot "assets")
Copy-Tree (Join-Path $Root "docs") (Join-Path $StageRoot "docs")
Copy-Tree (Join-Path $Root "scripts") (Join-Path $StageRoot "scripts")
Copy-Tree (Join-Path $Root "tests") (Join-Path $StageRoot "tests")
Remove-CacheFiles (Join-Path $StageRoot "scripts")
Remove-CacheFiles (Join-Path $StageRoot "tests")

$DataTarget = Join-Path $StageRoot "data"
$skeletonDirs = @(
  "review_results",
  "talent_profiles",
  "talent_profile_snapshots",
  "hrbp_profile_splits",
  "permissions",
  "report_generation",
  "report_generation\skills",
  "report_generation\materials",
  "report_generation\settings",
  "report_generation\reports_md",
  "design_center",
  "design_center\posters",
  "exports",
  "backups"
)
foreach ($dir in $skeletonDirs) {
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

$settingsSource = Join-Path $Root "data\report_generation\settings"
$settingsTarget = Join-Path $DataTarget "report_generation\settings"
if (Test-Path $settingsSource) {
  Get-ChildItem -LiteralPath $settingsSource -File | ForEach-Object {
    Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $settingsTarget $_.Name) -Force
  }
}

$agentLines = New-Object System.Collections.Generic.List[string]
$agentLines.Add("# HRobot Talent NineBox Web Source Package")
$agentLines.Add("")
$agentLines.Add("Purpose: unpack, inspect environment requirements, run tests, and start the local web app.")
$agentLines.Add("")
$agentLines.Add("## Requirements")
$agentLines.Add("")
$agentLines.Add("- Python 3.10+ recommended")
$agentLines.Add("- pip")
$agentLines.Add("- Browser access to localhost")
$agentLines.Add("")
$agentLines.Add("## Setup")
$agentLines.Add("")
$agentLines.Add("python -m venv .venv")
$agentLines.Add("Windows: .venv\Scripts\activate")
$agentLines.Add("macOS/Linux: source .venv/bin/activate")
$agentLines.Add("python -m pip install --upgrade pip")
$agentLines.Add("python -m pip install -r requirements.txt")
$agentLines.Add("")
$agentLines.Add("## Verify")
$agentLines.Add("")
$agentLines.Add("python -m py_compile server.py scripts/update_intelligence.py scripts/split_hrbp_profiles.py")
$agentLines.Add("python -m unittest tests.test_data_store -q")
$agentLines.Add("")
$agentLines.Add("## Run")
$agentLines.Add("")
$agentLines.Add(("python server.py --host 127.0.0.1 --port {0}" -f $Port))
$agentLines.Add(("Open: http://127.0.0.1:{0}/index.html" -f $Port))
$agentLines.Add("")
$agentLines.Add("## Package Scope")
$agentLines.Add("")
$agentLines.Add("This package intentionally excludes API keys, HR source data, generated reports, uploaded materials, exports, backups, caches, and logs.")
$agentLines.Add("")
$agentLines.Add("Use the app import screens to add data after environment validation.")
$agentReadme = [string]::Join("`n", $agentLines)
Write-Utf8NoBom -Path (Join-Path $StageRoot "README_AGENT.md") -Content ($agentReadme + "`n")

if (Test-Path $ZipPath) {
  Remove-Item -LiteralPath $ZipPath -Force
}
Compress-Archive -Path (Join-Path $StageRoot "*") -DestinationPath $ZipPath -Force

$manifest = [ordered]@{
  packageName = $PackageName
  platform = "web"
  type = "source"
  port = $Port
  createdAt = (Get-Date).ToString("s")
  artifact = $ZipPath
  includesHrData = $false
  includesApiKeys = $false
  includesTests = $true
}
$manifestPath = Join-Path $WebPackagesRoot "$PackageName.manifest.json"
Write-Utf8NoBom -Path $manifestPath -Content (($manifest | ConvertTo-Json -Depth 5) + "`n")

Assert-ProjectChild $BuildRoot
if (Test-Path $BuildRoot) {
  Remove-Item -LiteralPath $BuildRoot -Recurse -Force
}

Write-Host "Created package:"
Write-Host $ZipPath
Write-Host "Manifest:"
Write-Host $manifestPath
