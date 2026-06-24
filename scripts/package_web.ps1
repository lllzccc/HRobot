[CmdletBinding()]
param(
  [int]$Port = 8767,
  [string]$AppName = "hrobot",
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"

Write-Warning "package_web.ps1 is retained as a compatibility entry. Building the versioned macOS source package instead."
& (Join-Path $PSScriptRoot "package_mac_source.ps1") -Port $Port -AppName $AppName -Version $Version
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}
