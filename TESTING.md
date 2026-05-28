# Pi Desktop — Windows Testing Guide

## Prerequisites (install these on your Windows machine)

### 1. Node.js v22 LTS
- Download: https://nodejs.org/
- Install the **LTS** version (v22.x)
- Verify: open PowerShell → `node --version` → should show v22.x

### 2. pnpm
```powershell
npm install -g pnpm
```
Verify: `pnpm --version`

### 3. Rust
- Download: https://rustup.rs/
- Run the installer, accept defaults
- Verify: open a **new** PowerShell → `rustc --version`

### 4. Visual Studio Build Tools (for compiling Tauri)
- Download: https://visualstudio.microsoft.com/visual-cpp-build-tools/
- In the installer, select: **"Desktop development with C++"**
- This gives you the MSVC compiler and Windows SDK that Tauri needs

### 5. WebView2 (usually pre-installed on Windows 10/11)
- Already included in Windows 11
- Windows 10: download from https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### 6. Git for Windows
- Download: https://git-scm.com/download/win
- This gives you **Git Bash** which Pi needs for the `bash` tool

---

## Step 1: Get the Code

Copy the `/opt/july/pi-client` folder to your Windows machine. Options:

**Option A: Git (recommended)**
If the code is in a git repo, just clone it on Windows.

**Option B: Direct copy**
Copy the entire `pi-client` folder to your Windows machine, e.g.:
```
C:\Users\YourName\projects\pi-client\
```

**Option C: Create from scratch**
Since the project was scaffolded, you can also re-create it. But copying is easier for now.

---

## Step 2: Install Dependencies

Open **PowerShell** or **Git Bash** in the project root:

```powershell
cd C:\Users\YourName\projects\pi-client
pnpm install
```

This installs deps for both `bridge/` and `app/` packages.

---

## Step 3: Build the Bridge

```powershell
cd bridge
pnpm build
```

This creates `bridge/dist/pi-bridge.cjs`.

### Test the bridge standalone:

```powershell
echo '{"type":"ping","id":"1"}' | node dist/pi-bridge.cjs
```

You should see output like:
```json
{"type":"bridge_ready"}
{"type":"response","id":"1","success":true}
```

If you see this, the bridge works! ✅

---

## Step 4: Set Up the Sidecar Binary

Tauri sidecars need platform-specific naming. On Windows x64:

```powershell
cd app\src-tauri
mkdir binaries
copy ..\..\bridge\dist\pi-bridge.cjs binaries\pi-bridge-x86_64-pc-windows-msvc.exe
```

**Important:** The file MUST be named `pi-bridge-x86_64-pc-windows-msvc.exe`.
Tauri looks for this exact name based on your platform's target triple.

To check your target triple:
```powershell
rustc --print host-tuple
```
Should output: `x86_64-pc-windows-msvc`

---

## Step 5: Run the App in Dev Mode

```powershell
cd C:\Users\YourName\projects\pi-client
pnpm dev
```

This will:
1. Start Vite dev server for the Svelte frontend
2. Start `cargo` to compile the Rust backend (first build takes 5-10 minutes)
3. Open a desktop window titled "Pi Desktop"

**First launch will be slow** — Rust compiles all dependencies. Subsequent launches are fast (~3 seconds).

### What you should see:
1. A window opens (1200x800)
2. A welcome screen with "Select a project folder" button
3. Click the button → folder picker appears
4. Pick a folder → bridge initializes
5. Type a message → hit Enter → Pi responds

### If the window doesn't open:
- Check the terminal output for errors
- Common issue: `cargo` build failed → read the error message
- Common issue: sidecar not found → check `binaries/` folder naming

---

## Step 6: Test the Bridge End-to-End (without Tauri)

If `pnpm dev` doesn't work yet, you can test the bridge manually:

Terminal 1 — start the bridge:
```powershell
cd C:\Users\YourName\projects\pi-client\bridge
node dist\pi-bridge.cjs
```

Terminal 2 — send commands via pipe (PowerShell):
```powershell
# First, set an API key (you need a real one)
$env:ANTHROPIC_API_KEY = "sk-ant-your-key-here"

# Send an init + prompt
echo '{"type":"init","id":"1","cwd":"C:\\Users\\YourName\\projects\\test"}' | node dist\pi-bridge.cjs
```

Or use an interactive test (create `test-bridge.js` in bridge/):
```javascript
import { spawn } from "child_process";
const child = spawn("node", ["dist/pi-bridge.cjs"], { stdio: ["pipe", "pipe", "inherit"] });

child.stdout.on("data", (data) => {
  for (const line of data.toString().split("\n")) {
    if (line.trim()) console.log("EVENT:", JSON.parse(line));
  }
});

// Send init
child.stdin.write(JSON.stringify({ type: "init", id: "1", cwd: "C:\\Users\\YourName\\projects\\test" }) + "\n");

// Wait 2 seconds, then send prompt
setTimeout(() => {
  child.stdin.write(JSON.stringify({ type: "prompt", id: "2", message: "List files in this directory" }) + "\n");
}, 2000);
```

```powershell
node test-bridge.js
```

---

## Troubleshooting

### "cargo check" fails
- Make sure Visual Studio Build Tools are installed with C++ workload
- Run: `rustc --print host-tuple` should show `x86_64-pc-windows-msvc`
- Run: `cargo --version` should show 1.80+

### Sidecar not found
- The file in `app/src-tauri/binaries/` must be named EXACTLY `pi-bridge-x86_64-pc-windows-msvc.exe`
- It must have the `.exe` extension
- Run `rustc --print host-tuple` to verify the suffix

### Bridge crashes on init
- Make sure `ANTHROPIC_API_KEY` (or your chosen provider key) is set:
  ```powershell
  $env:ANTHROPIC_API_KEY = "sk-ant-..."
  ```
- Or configure it in the Pi Desktop settings panel after launch

### Vite dev server fails
- Try: `cd app && pnpm dev` separately
- Check if port 5173 or 1420 is already in use

### WebView2 errors
- Install/update WebView2: https://developer.microsoft.com/en-us/microsoft-edge/webview2/

### Rust compilation takes forever
- First build compiles all dependencies (~10 minutes). Normal.
- Subsequent builds are incremental (~30 seconds)

---

## Quick Reference: Key Files to Check

| What | Where |
|------|-------|
| Bridge source | `bridge/src/` (index.ts, agent.ts, protocol.ts) |
| Bridge build output | `bridge/dist/pi-bridge.cjs` |
| Rust source | `app/src-tauri/src/` (lib.rs, bridge.rs, commands.rs) |
| Svelte UI | `app/src/routes/+page.svelte`, `app/src/lib/components/` |
| Tauri config | `app/src-tauri/tauri.conf.json` |
| Sidecar binary | `app/src-tauri/binaries/pi-bridge-x86_64-pc-windows-msvc.exe` |
| Capabilities | `app/src-tauri/capabilities/default.json` |
