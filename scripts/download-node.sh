#!/bin/bash
# Downloads Node.js binary for bundling
set -e

NODE_VERSION="${1:-v22.22.3}"
PLATFORM="${2:-$(uname -s | tr '[:upper:]' '[:lower:]')}"
ARCH="${3:-x64}"

# Map platform names
case "$PLATFORM" in
  win|windows) PLATFORM="win" ;;
  mac|darwin) PLATFORM="darwin" ;;
  linux) PLATFORM="linux" ;;
esac

# Map arch names
case "$ARCH" in
  x86_64|amd64|x64) ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
esac

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUTDIR="$PROJECT_DIR/dist/node-runtime/${PLATFORM}-${ARCH}"

echo "=== Downloading Node.js ${NODE_VERSION} for ${PLATFORM}-${ARCH} ==="

case "$PLATFORM" in
  win)
    FILE="node-${NODE_VERSION}-win-${ARCH}.zip"
    URL="https://nodejs.org/dist/${NODE_VERSION}/${FILE}"
    ;;
  darwin)
    FILE="node-${NODE_VERSION}-darwin-${ARCH}.tar.gz"
    URL="https://nodejs.org/dist/${NODE_VERSION}/${FILE}"
    ;;
  linux)
    FILE="node-${NODE_VERSION}-linux-${ARCH}.tar.xz"
    URL="https://nodejs.org/dist/${NODE_VERSION}/${FILE}"
    ;;
  *)
    echo "Unsupported platform: $PLATFORM"
    exit 1
    ;;
esac

echo "URL: $URL"
mkdir -p "$OUTDIR"

TMPFILE="/tmp/$FILE"
if [ ! -f "$TMPFILE" ]; then
  echo "Downloading..."
  curl -L "$URL" -o "$TMPFILE"
else
  echo "Using cached: $TMPFILE"
fi

case "$PLATFORM" in
  win) unzip -q -o "$TMPFILE" -d "$OUTDIR" ;;
  *) tar xf "$TMPFILE" -C "$OUTDIR" --strip-components=1 ;;
esac

echo ""
echo "=== Node.js runtime ready in: $OUTDIR ==="
ls "$OUTDIR"
