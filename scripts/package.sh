#!/bin/bash
# Full build pipeline: bridge SEA + copy sidecar + Tauri build (NSIS installer)
# For a portable folder/ZIP instead, use: bash scripts/build-portable.sh
set -e

echo "========================================"
echo "  Pi Desktop — Full Package Build"
echo "========================================"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo ""
echo "=== Step 1: Build bridge JS bundle ==="
cd bridge && pnpm build && cd ..

echo ""
echo "=== Step 2: Build bridge SEA ==="
bash scripts/build-bridge-sea.sh

echo ""
echo "=== Step 3: Copy sidecar to Tauri binaries ==="
mkdir -p app/src-tauri/binaries
OS="$(uname -s 2>/dev/null || echo Linux)"
case "$OS" in
  Linux*)   TARGET="pi-bridge-x86_64-unknown-linux-gnu" ;;
  Darwin*)  TARGET="pi-bridge-aarch64-apple-darwin" ;;
  *)        TARGET="pi-bridge-x86_64-unknown-linux-gnu" ;;
esac
cp bridge/dist/pi-bridge "app/src-tauri/binaries/$TARGET"
echo "    Copied to: app/src-tauri/binaries/$TARGET"

echo ""
echo "=== Step 4: Build Tauri app ==="
cd app && pnpm tauri build

echo ""
echo "========================================"
echo "  Build complete!"
echo "  Installer: app/src-tauri/target/release/bundle/"
echo "========================================"
