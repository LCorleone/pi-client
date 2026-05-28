# Full build pipeline for Windows (NSIS installer)
# For a portable folder/ZIP instead, use: powershell -File scripts\build-portable.ps1
$ErrorActionPreference = "Stop"

Write-Host "========================================"
Write-Host "  Pi Desktop — Full Package Build"
Write-Host "========================================"

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $ProjectDir

Write-Host ""
Write-Host "=== Step 1: Build bridge JS bundle ==="
Set-Location bridge; pnpm build; Set-Location ..

Write-Host ""
Write-Host "=== Step 2: Build bridge SEA ==="
powershell -File scripts\build-bridge-sea.ps1

Write-Host ""
Write-Host "=== Step 3: Copy sidecar to Tauri binaries ==="
$BinDir = Join-Path $ProjectDir "app\src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null
$Sidecar = Join-Path $ProjectDir "bridge\dist\pi-bridge-x86_64-pc-windows-msvc.exe"
Copy-Item $Sidecar $BinDir
Write-Host "    Copied to: $BinDir\pi-bridge-x86_64-pc-windows-msvc.exe"

Write-Host ""
Write-Host "=== Step 4: Build Tauri ==="
Set-Location app; pnpm tauri build; Set-Location ..

Write-Host ""
Write-Host "========================================"
Write-Host "  Build complete!"
Write-Host "  Installer: app\src-tauri\target\release\bundle\"
Write-Host "========================================"
