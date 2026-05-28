# Handoff — 2026-05-28

## Purpose
Continue developing Pi Desktop client — next steps: user testing on Windows, then Phase 5 (macOS) or bug fixes.

## What Was Done
- Designed and planned full Pi Desktop architecture: Tauri v2 + Svelte 5 + Node.js bridge (Pi SDK)
- Implemented all 5 phases: Scaffold, Chat UI, Session Management, Rich UI Features, Firm Features & Bundling
- Added portable ZIP build scripts (`scripts/build-portable.sh/ps1`) alongside NSIS installer
- Created GitHub Actions CI workflow (`.github/workflows/build.yml`) for automated Windows builds
- Fixed 6 CI build failures (SEA config paths, signtool, sentinel fuse detection, Tauri v2 API: CommandEvent receiver, manage() on App not AppHandle, exhaustive match)
- **Build is green** — portable ZIP artifact downloadable from GitHub Actions

## Current State
- **Working on**: All 5 phases complete. App builds successfully on GitHub Actions.
- **Blocked on**: None — waiting for July to test the portable ZIP on his Windows machine
- **Known issues**: 3 harmless Rust warnings (unused imports, dead code) — noted but not fixed. Node.js 20 actions deprecation warning from GitHub (non-blocking, June 2026 deadline).

## Artifacts
- `PLAN.md` — Full implementation plan with architecture, decisions, phases
- `TESTING.md` — Windows testing guide (manual, now superseded by CI)
- `.github/workflows/build.yml` — GitHub Actions Windows build pipeline
- `scripts/build-portable.ps1` — Local Windows portable build script
- `scripts/package.ps1` — Local Windows NSIS installer build script
- `bridge/` — Node.js sidecar using Pi SDK (builds to SEA single exe)
- `app/` — Tauri v2 + Svelte 5 desktop app
- GitHub repo: `https://github.com/LCorleone/pi-client` (public)

## Key Technical Decisions
- Tauri v2 (not Electron) — ~10MB vs ~150MB
- Svelte 5 with runes (not React/Solid) — smallest bundle
- Pi SDK mode (not RPC) — full programmatic control over tools, models, prompts
- Node.js (not Bun) — Pi is Node-first, more stable for non-technical users
- Node.js SEA for bridge — single pi-bridge.exe, no visible node_modules
- pnpm as package manager
- User configures API key (URL + key + model name in settings)
- User picks working directory via folder dialog
- Git Bash for shell (detected in setup wizard, not bundled)
- Both NSIS installer and portable ZIP distribution

## CI Build Notes (for future debugging)
- SEA sentinel fuse must be detected dynamically (varies by Node.js version)
- `signtool` is at `C:\Program Files (x86)\Windows Kits\10\bin\{version}\x64\signtool.exe`
- Tauri v2 `CommandEvent` is a channel receiver (not `AsyncRead`) — use `rx.recv().await`
- `app.manage()` works in `.setup()`, not on `AppHandle`
- `show_menu_on_left_click` (not `menu_on_left_click` — deprecated)
- `on_window_event` (not `on_window_move` — doesn't exist in Tauri v2)

## How to Download & Test
1. Go to https://github.com/LCorleone/pi-client/actions
2. Click latest green "Build Pi Desktop" run
3. Download "Pi-Desktop-Portable-ZIP" artifact
4. Extract → double-click Pi Desktop.exe
5. First run: setup wizard (API key + Git Bash + folder)

## Suggested Next Steps
- July tests portable ZIP on Windows → report issues
- Fix any runtime bugs found during testing
- Phase 5: macOS support (build on macOS runner, .dmg)
- Polish: real app icon, better error messages, connection test in setup wizard
