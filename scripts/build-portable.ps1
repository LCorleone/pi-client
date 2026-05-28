# Build portable Pi Desktop — no installer, just a folder with 2 exes
# Usage: .\scripts\build-portable.ps1 [-Version "0.1.0"]
param(
    [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$AppName = "Pi Desktop"
$DistDir = "dist\$AppName Portable"

Write-Host "========================================"
Write-Host "  Building Portable $AppName v$Version"
Write-Host "========================================"

# Step 1: Build bridge JS bundle
Write-Host ""
Write-Host "[1/4] Building bridge..." -ForegroundColor Yellow
Set-Location bridge; pnpm build; Set-Location ..

# Step 2: Build SEA binary
Write-Host ""
Write-Host "[2/4] Building SEA binary..." -ForegroundColor Yellow
powershell -File scripts\build-bridge-sea.ps1

# Step 3: Build Tauri (release, no installer bundling)
Write-Host ""
Write-Host "[3/4] Building Tauri..." -ForegroundColor Yellow
Set-Location app; pnpm tauri build --no-bundle; Set-Location ..

# Step 4: Assemble portable folder
Write-Host ""
Write-Host "[4/4] Assembling portable folder..." -ForegroundColor Yellow
if (Test-Path $DistDir) { Remove-Item -Recurse -Force $DistDir }
New-Item -ItemType Directory -Force -Path $DistDir | Out-Null

# Copy main app
Copy-Item app\src-tauri\target\release\pi-desktop.exe "$DistDir\$AppName.exe"

# Copy bridge sidecar (rename for cleanliness)
Copy-Item bridge\dist\pi-bridge-x86_64-pc-windows-msvc.exe "$DistDir\pi-bridge.exe"

# Copy WebView2 bootstrapper if it exists in the Tauri output
$webview2Path = "app\src-tauri\target\release\WebView2Loader.dll"
if (Test-Path $webview2Path) {
    Copy-Item $webview2Path "$DistDir\"
}

# Create README
@"
$AppName — Portable Edition v$Version
============================================

Just run $AppName.exe. No installation needed.

Requirements:
  - Windows 10 or 11 (WebView2 runtime is built-in on Windows 11)
  - If WebView2 is missing on Windows 10, the app will prompt to install it
  - No Node.js installation needed (bundled in pi-bridge.exe)

First run will guide you through setup:
  1. Enter your API provider URL and key
  2. Select or install Git Bash (for agent shell commands)
  3. Pick your project folder

That's it. Happy coding!
"@ | Out-File -Encoding UTF8 "$DistDir\README.txt"

Write-Host ""
Write-Host "========================================"
Write-Host "  Done!" -ForegroundColor Green
Write-Host "========================================"
Write-Host "  Portable folder: $DistDir\" -ForegroundColor Green
Get-ChildItem "$DistDir" | Format-Table Name, Length

# Create ZIP
$ZipPath = "dist\$AppName-v$Version-Portable.zip"
if (Get-Command Compress-Archive -ErrorAction SilentlyContinue) {
    Write-Host ""
    Write-Host "Creating ZIP: $ZipPath" -ForegroundColor Yellow
    if (Test-Path $ZipPath) { Remove-Item $ZipPath }
    Compress-Archive -Path "$DistDir\*" -DestinationPath $ZipPath
    $Size = (Get-Item $ZipPath).Length / 1MB
    Write-Host "ZIP size: $([math]::Round($Size, 1)) MB" -ForegroundColor Green
}
