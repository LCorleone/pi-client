#!/bin/bash
# Build portable Pi Desktop — no installer, just a folder with executables
# Usage: ./scripts/build-portable.sh [version]
set -e

VERSION="${1:-0.1.0}"
APP_NAME="Pi Desktop"

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

DIST_DIR="dist/${APP_NAME} Portable"

echo "========================================"
echo "  Building Portable ${APP_NAME} v${VERSION}"
echo "========================================"

# Step 1: Build bridge JS bundle
echo ""
echo "[1/4] Building bridge..."
cd bridge && pnpm build && cd ..

# Step 2: Build SEA binary
echo ""
echo "[2/4] Building SEA binary..."
bash scripts/build-bridge-sea.sh

# Step 3: Build Tauri release binary (not the installer)
echo ""
echo "[3/4] Building Tauri..."
cd app && pnpm tauri build --no-bundle && cd ..

# Step 4: Assemble portable folder
echo ""
echo "[4/4] Assembling portable folder..."
rm -rf "$DIST_DIR"
mkdir -p "$DIST_DIR"

OS="$(uname -s)"
case "$OS" in
  Linux*)
    cp app/src-tauri/target/release/pi-desktop "$DIST_DIR/"
    cp bridge/dist/pi-bridge "$DIST_DIR/"
    ;;
  Darwin*)
    cp app/src-tauri/target/release/bundle/macos/"${APP_NAME}".app/Contents/MacOS/"${APP_NAME}" "$DIST_DIR/" 2>/dev/null || \
      cp app/src-tauri/target/release/pi-desktop "$DIST_DIR/"
    cp bridge/dist/pi-bridge "$DIST_DIR/"
    ;;
esac

# Create README
cat > "$DIST_DIR/README.txt" << EOF
${APP_NAME} — Portable Edition v${VERSION}
============================================

Just run the executable. No installation needed.

Requirements:
  - Linux or macOS with a webkit-based browser
  - No Node.js installation needed (bundled in pi-bridge)

First run will guide you through setup:
  1. Enter your API provider URL and key
  2. Select or install Git Bash (for agent shell commands)
  3. Pick your project folder

That's it. Happy coding!
EOF

echo ""
echo "========================================"
echo "  Done!"
echo "========================================"
echo "  Portable folder: ${DIST_DIR}/"
echo ""
ls -lh "$DIST_DIR/"
