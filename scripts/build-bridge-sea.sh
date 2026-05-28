#!/bin/bash
# Build bridge into a single executable using Node.js SEA (Single Executable Application)
set -e

echo "=== Building bridge SEA ==="

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BRIDGE_DIR="$PROJECT_DIR/bridge"

# Step 1: Build the JS bundle
echo "[1/6] Building JS bundle..."
cd "$BRIDGE_DIR"
pnpm build

# Step 2: Generate SEA blob
echo "[2/6] Generating SEA blob..."
node --experimental-sea-config sea-config.json

# Step 3: Copy node binary
echo "[3/6] Copying node binary..."
NODE_BIN="$(command -v node)"
cp "$NODE_BIN" dist/pi-bridge
chmod +w dist/pi-bridge

# Step 4: Remove signature (macOS only)
if [[ "$(uname -s)" == "Darwin" ]]; then
  echo "[4/6] Removing code signature (macOS)..."
  codesign --remove-signature dist/pi-bridge 2>/dev/null || true
else
  echo "[4/6] Skipping code signature removal (not macOS)..."
fi

# Step 5: Detect the correct sentinel fuse from the Node binary
echo "[5/6] Detecting sentinel fuse..."
FUSE=$(node -e "
const buf = require('fs').readFileSync(process.execPath);
const all = buf.toString('latin1');
const re = /NODE_SEA_FUSE_[a-f0-9]{20,}/g;
const match = re.exec(all);
if (match) console.log(match[0]);
else console.log('NODE_SEA_FUSE_fce655ab');
")
echo "    Detected fuse: ${FUSE:0:30}..."

# Step 6: Inject blob
echo "[6/6] Injecting SEA blob..."
npx postject dist/pi-bridge NODE_SEA_BLOB dist/sea-prep.blob \
  --sentinel-fuse "$FUSE"

echo ""
echo "=== SEA binary created ==="
ls -lh dist/pi-bridge
echo ""
echo "Test it with: echo '{\"type\":\"ping\",\"id\":\"1\"}' | ./dist/pi-bridge"
