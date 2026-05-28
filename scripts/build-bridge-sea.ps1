# Build bridge into a single .exe using Node.js SEA (Single Executable Application)
# Run this on Windows with PowerShell
$ErrorActionPreference = "Stop"

Write-Host "=== Building bridge SEA ==="

$ProjectDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$BridgeDir = Join-Path $ProjectDir "bridge"

# Step 1: Build the JS bundle
Write-Host "[1/5] Building JS bundle..."
Set-Location $BridgeDir
pnpm build

# Step 2: Generate SEA blob
Write-Host "[2/5] Generating SEA blob..."
node --experimental-sea-config sea-config.json

# Step 3: Copy node.exe and prepare output
Write-Host "[3/5] Copying node.exe..."
$NodePath = (Get-Command node).Source
$OutputExe = Join-Path $BridgeDir "dist\pi-bridge-x86_64-pc-windows-msvc.exe"
Copy-Item $NodePath $OutputExe

# Step 4: Remove signature (Windows doesn't need this, but just in case)
Write-Host "[4/5] Preparing executable..."

# Step 5: Inject blob
Write-Host "[5/5] Injecting SEA blob..."
npx postject $OutputExe NODE_SEA_BLOB dist\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce655ab

Write-Host ""
Write-Host "=== SEA binary created ==="
Get-Item $OutputExe | Format-List Name, Length, FullName
