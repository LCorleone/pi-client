# Download Node.js for bundling on Windows
param(
    [string]$NodeVersion = "v22.22.3",
    [string]$Arch = "x64"
)

$ErrorActionPreference = "Stop"

$File = "node-$NodeVersion-win-$Arch.zip"
$Url = "https://nodejs.org/dist/$NodeVersion/$File"
$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$OutDir = Join-Path $ProjectDir "dist\node-runtime\win-$Arch"

Write-Host "=== Downloading Node.js $NodeVersion for Windows $Arch ==="
Write-Host "URL: $Url"

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null

$TempFile = Join-Path $env:TEMP $File
if (-not (Test-Path $TempFile)) {
    Write-Host "Downloading..."
    Invoke-WebRequest -Uri $Url -OutFile $TempFile
} else {
    Write-Host "Using cached: $TempFile"
}

Write-Host "Extracting..."
Expand-Archive -Path $TempFile -DestinationPath $OutDir -Force

Write-Host ""
Write-Host "=== Node.js runtime ready in: $OutDir ==="
Get-ChildItem $OutDir | Select-Object Name
