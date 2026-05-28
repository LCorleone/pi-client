# Pi Desktop Client — Implementation Plan

## Overview

A lightweight Windows-first desktop client for Pi coding agent, built with **Tauri v2 + Svelte 5 + Pi SDK**. Target users are non-technical firm members who need a zero-config experience.

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Shell | Tauri v2 (Rust) | Native window, system tray, sidecar management |
| Frontend | Svelte 5 + Tailwind CSS | Chat UI, session management, settings |
| Agent Bridge | TypeScript (Node.js) | Uses Pi SDK to create/manage agent sessions |
| Bundled Runtime | Node.js (~v22 LTS) | Hidden from user, runs bridge.ts |

**Target size:** ~30MB download, ~55MB installed

---

## Architecture

```
User clicks in UI
       │
       ▼
┌──────────────────┐
│  Svelte 5 UI     │  ← Chat, settings, session list
│  (WebView2)      │
└────────┬─────────┘
         │ Tauri IPC: invoke("send_prompt", { message })
         │           listen("agent_event", callback)
         ▼
┌──────────────────┐
│  Rust Core       │  ← Manages sidecar lifecycle
│  (Tauri backend) │    Routes IPC ↔ stdin/stdout
│                  │    System tray, window management
└────────┬─────────┘
         │ stdin: JSON commands  →  stdout: JSON events
         ▼
┌──────────────────┐
│  Node.js Bridge  │  ← bridge.ts (~300 lines)
│  (sidecar)       │    Uses Pi SDK directly
│                  │    createAgentSession, ModelRegistry
│                  │    Custom tools, system prompt
└──────────────────┘
```

### Why a sidecar (subprocess) instead of embedding Node.js?

Tauri is Rust-only. We cannot load Node.js/TypeScript into the Rust process.
The bridge runs as a subprocess communicating via JSON over stdin/stdout — the
same pattern Tauri officially recommends for sidecar binaries.

---

## Bridge Protocol (Rust ↔ Node.js)

The bridge speaks a simple JSONL protocol. Each line is one JSON object.

### Commands (Tauri → Bridge, via stdin)

```jsonc
// Initialize a session
{ "type": "init", "id": "1", "cwd": "C:\\Users\\alice\\project" }

// Send a prompt
{ "type": "prompt", "id": "2", "message": "List files in this directory" }

// Queue steering message during streaming
{ "type": "steer", "id": "3", "message": "Focus on test files only" }

// Queue follow-up message
{ "type": "follow_up", "id": "4", "message": "Also check package.json" }

// Abort current operation
{ "type": "abort", "id": "5" }

// Switch model
{ "type": "set_model", "id": "6", "provider": "anthropic", "modelId": "claude-sonnet-4-20250514" }

// List available models
{ "type": "get_models", "id": "7" }

// Get session state
{ "type": "get_state", "id": "8" }

// Get message history
{ "type": "get_messages", "id": "9" }

// Compact context
{ "type": "compact", "id": "10", "customInstructions": "Keep code changes" }

// New session
{ "type": "new_session", "id": "11" }

// List sessions
{ "type": "list_sessions", "id": "12" }

// Shutdown bridge
{ "type": "shutdown", "id": "99" }
```

### Events (Bridge → Tauri, via stdout)

```jsonc
// Response to a command (correlated by id)
{ "type": "response", "id": "2", "success": true, "data": {} }
{ "type": "response", "id": "2", "success": false, "error": "Model not found" }

// Streaming agent events (no id — async)
{ "type": "agent_start" }
{ "type": "message_start", "message": { "role": "assistant", ... } }
{ "type": "text_delta", "contentIndex": 0, "delta": "Hello " }
{ "type": "thinking_delta", "delta": "Let me think..." }
{ "type": "tool_call_start", "toolCallId": "c1", "toolName": "bash", "args": {...} }
{ "type": "tool_call_update", "toolCallId": "c1", "partialResult": {...} }
{ "type": "tool_call_end", "toolCallId": "c1", "result": {...}, "isError": false }
{ "type": "message_end", "message": {...} }
{ "type": "agent_end", "messages": [...] }
{ "type": "compaction_start", "reason": "threshold" }
{ "type": "compaction_end", "result": {...} }

// Bridge lifecycle
{ "type": "bridge_ready" }
{ "type": "bridge_error", "error": "..." }
```

### Why not just use Pi's RPC protocol?

Pi's RPC protocol is designed for generic clients. Our bridge is **purpose-built**:
- Maps directly to Pi SDK calls (type-safe, no protocol guessing)
- Filters/transforms events for the UI (e.g., skip internal messages)
- Adds firm-specific logic (default models, custom tools, system prompts)
- Can evolve independently from Pi's RPC spec changes

---

## Project Structure

```
pi-desktop/
├── package.json                    # Root: build scripts, dev deps
├── pnpm-workspace.yaml
│
├── src-tauri/                      # ── Rust backend ──
│   ├── Cargo.toml                  # tauri v2, tauri-plugin-shell, serde, tokio
│   ├── tauri.conf.json             # App config, window, sidecar
│   ├── capabilities/
│   │   └── default.json            # Tauri v2 permissions
│   ├── src/
│   │   ├── main.rs                 # Windows main (sets up app)
│   │   ├── lib.rs                  # App builder, plugins, state init
│   │   ├── bridge.rs               # Sidecar lifecycle: spawn, restart, kill
│   │   ├── commands.rs             # All #[tauri::command] functions
│   │   └── state.rs                # AppState (managed by Tauri)
│   └── binaries/                   # Sidecar binaries (per-target)
│       └── pi-bridge-x86_64-pc-windows-msvc.exe
│
├── app/                            # ── Svelte 5 frontend ──
│   ├── package.json
│   ├── svelte.config.js
│   ├── vite.config.ts
│   ├── index.html
│   ├── src/
│   │   ├── app.html
│   │   ├── app.css                 # Tailwind imports
│   │   ├── App.svelte              # Root layout (sidebar + main)
│   │   ├── main.ts                 # Mount point
│   │   ├── lib/
│   │   │   ├── ipc.ts              # Typed Tauri invoke/listen wrappers
│   │   │   ├── stores/
│   │   │   │   ├── session.svelte.ts   # Current session state (runes)
│   │   │   │   ├── messages.svelte.ts  # Message list + streaming
│   │   │   │   └── models.svelte.ts    # Available models, current
│   │   │   └── components/
│   │   │       ├── ChatPanel.svelte         # Message list + input area
│   │   │       ├── MessageBubble.svelte     # Single message render
│   │   │       ├── StreamingText.svelte     # Real-time markdown
│   │   │       ├── ToolCallCard.svelte      # Collapsible tool output
│   │   │       ├── ThinkingBlock.svelte     # Collapsible thinking
│   │   │       ├── InputEditor.svelte       # Multi-line input + send
│   │   │       ├── ModelSelector.svelte     # Model picker
│   │   │       ├── SessionList.svelte       # Sidebar session list
│   │   │       └── StatusBar.svelte         # Token count, model, cost
│   │   └── routes/                 # Future: if using SvelteKit
│   └── static/
│       └── icons/                  # App icons (png, ico)
│
├── bridge/                         # ── Node.js sidecar ──
│   ├── package.json                # @earendil-works/pi-coding-agent
│   ├── tsconfig.json
│   ├── src/
│   │   ├── index.ts                # Entry point: readline stdin, process events
│   │   ├── agent.ts                # createAgentSession, subscribe, lifecycle
│   │   ├── protocol.ts             # Command parsing, event serialization
│   │   └── config.ts               # Default models, system prompt, custom tools
│   └── build.js                    # Bundle script: produces single pi-bridge.js
│
├── scripts/
│   ├── build-bridge.sh             # Build bridge for current platform
│   ├── bundle-node.sh              # Download + bundle Node.js runtime
│   └── package-all.sh              # Build Tauri + bridge + installer
│
└── README.md
```

---

## Implementation Phases

### Phase 0: Project Scaffold
**Goal:** Runnable Tauri + Svelte 5 app with a "Hello World" bridge

| Step | Task | Verify |
|------|------|--------|
| 0.1 | Initialize Tauri v2 project with Svelte 5 frontend | `pnpm tauri dev` opens a window |
| 0.2 | Set up Tailwind CSS | Classes render correctly |
| 0.3 | Create bridge/ package with Pi SDK dependency | `pnpm install` succeeds |
| 0.4 | Write minimal bridge.ts: init Pi SDK, read JSON from stdin, write JSON to stdout | Manual test: `echo '{"type":"init","id":"1"}' \| node bridge/dist/index.js` |
| 0.5 | Wire Rust sidecar manager: spawn bridge, read stdout, emit Tauri events | Rust logs show `bridge_ready` event |
| 0.6 | Svelte frontend: listen to bridge events, display in a `<pre>` tag | Events appear in the UI |
| 0.7 | Wire bidirectional IPC: button click → Rust command → bridge stdin → Pi responds → UI updates | Click button, see Pi response |

**Deliverable:** A working end-to-end pipeline — click a button, get a Pi response in the UI.

---

### Phase 1: Chat UI (Core)
**Goal:** Full conversational chat with streaming, model selection

| Step | Task | Verify |
|------|------|--------|
| 1.1 | ChatPanel layout: message list (scrollable) + input area (fixed bottom) | Layout renders, scrolls correctly |
| 1.2 | StreamingText component: render markdown with syntax highlighting as it streams | Text appears token by token, code blocks highlighted |
| 1.3 | MessageBubble: render user messages and assistant messages differently | Clear visual distinction |
| 1.4 | InputEditor: multi-line input, Enter sends, Shift+Enter newline | Input works, messages send |
| 1.5 | Wire prompt flow: type → invoke("send_prompt") → bridge → Pi SDK → stream back | Full conversation works |
| 1.6 | ToolCallCard: render tool calls with collapsible output | bash output, file reads show in expandable cards |
| 1.7 | ThinkingBlock: render thinking content in collapsible section | Thinking blocks show when enabled |
| 1.8 | ModelSelector: dropdown listing available models, switching works | Can switch models mid-session |
| 1.9 | Abort button: stop current generation | Agent stops, partial response preserved |
| 1.10 | StatusBar: show model name, token count, cost | Footer updates in real-time |

**Deliverable:** A usable chat interface that matches core Pi terminal functionality.

---

### Phase 2: Session Management
**Goal:** Create, resume, list, and switch sessions

| Step | Task | Verify |
|------|------|--------|
| 2.1 | SessionList sidebar: list saved sessions | Sessions appear in sidebar |
| 2.2 | New session: button creates fresh session | New session starts clean |
| 2.3 | Resume session: click saved session, restore messages | History loads correctly |
| 2.4 | Session persistence: messages survive app restart | Close and reopen → same messages |
| 2.5 | Session naming: display auto-name, allow rename | Sessions identifiable |
| 2.6 | Delete session: remove from list and disk | Session removed cleanly |

**Deliverable:** Multi-session support with persistence.

---

### Phase 3: Rich UI Features
**Goal:** Desktop-quality experience beyond terminal capabilities

| Step | Task | Verify |
|------|------|--------|
| 3.1 | Diff viewer: side-by-side or unified diff when `edit` tool runs | Syntax-highlighted diffs |
| 3.2 | File browser: tree view of working directory | Navigate project files |
| 3.3 | Image support: paste images into input, display in chat | Images render inline |
| 3.4 | Settings panel: API keys, default model, theme, shell path | Settings save and apply |
| 3.5 | System tray: minimize to tray, notification on completion | Tray icon works, notifications fire |
| 3.6 | Global shortcut: hotkey to show/hide window (e.g., Ctrl+Shift+P) | Shortcut toggles window |
| 3.7 | Theme support: dark/light mode toggle | Theme switches smoothly |
| 3.8 | Keyboard shortcuts: common actions (new session, switch model, etc.) | Shortcuts work |

**Deliverable:** Polished desktop experience.

---

### Phase 4: Firm Features & Bundling
**Goal:** Firm-ready distribution with custom config

| Step | Task | Verify |
|------|------|--------|
| 4.1 | Default model config: pre-configure local provider in bundled config | First launch shows local model |
| 4.2 | Custom system prompt: firm-specific agent instructions | Agent follows firm guidelines |
| 4.3 | Custom tools: firm knowledge base search tool | Tool works in agent session |
| 4.4 | Bundle Node.js: download and package Node.js runtime alongside bridge | App runs without Node.js installed |
| 4.5 | Build Windows installer (NSIS) and portable ZIP | NSIS `.exe` installer + portable `.zip` |
| 4.6 | Auto-update: check for updates, prompt to download | Update notification works |
| 4.7 | First-run wizard: set working directory, accept terms | Smooth first-time experience |

**Deliverable:** Windows installer (.exe) AND portable ZIP, zero-config for non-technical users.

**Distribution formats:**
- **NSIS installer** (`.exe`) — for firm-wide rollout via `scripts/package.ps1`
- **Portable ZIP** — extract-and-run folder via `scripts/build-portable.ps1` (also creates a `.zip`)

---

### Phase 5: macOS Support
**Goal:** Cross-platform support

| Step | Task | Verify |
|------|------|--------|
| 5.1 | Build bridge for macOS (arm64 + x86_64) | Sidecar runs on macOS |
| 5.2 | Test Tauri app on macOS | Window, tray, shortcuts work |
| 5.3 | Build macOS .dmg | Installer works |
| 5.4 | CI: GitHub Actions for Windows + macOS builds | Automated releases |

**Deliverable:** macOS .dmg alongside Windows .exe

---

## Key Technical Decisions

### 1. How to bundle Node.js + Bridge

```
src-tauri/binaries/
├── pi-bridge-x86_64-pc-windows-msvc.exe    # Bundled node.exe + bridge.js (single exe via pkg or sea)
```

**Approach:** Use Node.js Single Executable Application (SEA) API:
```bash
# Build bridge into a single executable
node --experimental-sea-config sea-config.json
# Copy node.exe and inject the sea blob
npx postject pi-bridge.exe NODE_SEA_BLOB sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce655ab
```

This produces a single `pi-bridge.exe` (~45MB) that Tauri treats as a sidecar.
No separate node.exe, no node_modules folder visible to the user.

**Alternative:** If SEA has issues, fall back to bundling `node.exe + pi-bridge.js` as a folder
and have Rust spawn `node.exe pi-bridge.js`.

### 2. Bridge ↔ Pi SDK

```typescript
// bridge/src/agent.ts (conceptual)
import {
  AuthStorage,
  ModelRegistry,
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";

let session: AgentSession;

async function handleInit(cmd: InitCommand) {
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);
  
  const loader = new DefaultResourceLoader({
    cwd: cmd.cwd,
    systemPromptOverride: () => getFirmSystemPrompt(),
  });
  await loader.reload();

  const result = await createAgentSession({
    cwd: cmd.cwd,
    authStorage,
    modelRegistry,
    resourceLoader: loader,
    sessionManager: SessionManager.create(cmd.cwd),
  });

  session = result.session;
  
  // Subscribe to all events and forward to stdout
  session.subscribe((event) => {
    writeEvent(mapEvent(event));
  });
}
```

### 3. Frontend State Management (Svelte 5 Runes)

```typescript
// app/src/lib/stores/session.svelte.ts
let state = $state<{
  isStreaming: boolean;
  currentModel: Model | null;
  sessionId: string | null;
}>({
  isStreaming: false,
  currentModel: null,
  sessionId: null,
});

export function getState() { return state; }
```

Svelte 5 runes ($state, $derived) replace the need for Svelte stores or external state libs.

---

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Pi SDK breaking changes | Medium | High | Pin Pi version, test before upgrading |
| Node.js SEA issues on Windows | Medium | Medium | Fall back to node.exe + .js bundle |
| WebView2 compatibility | Low | High | WebView2 is built into Windows 10/11 |
| Bridge subprocess crashes | Medium | Medium | Rust auto-restarts, preserve session from disk |
| Large node_modules in bundle | High | Medium | Use `node --sea` to bake everything into one exe |
| Pi's native .node modules fail | Low | Low | We don't use TUI — native modules are optional |

---

## Resolved Decisions

| # | Question | Decision |
|---|----------|----------|
| 1 | Node.js SEA or plain bundle? | **SEA** — single `pi-bridge.exe`, no visible runtime |
| 2 | Working directory selection? | **User picks** — folder picker dialog on first launch |
| 3 | API key management? | **User configures** — URL + API key + model name in settings panel |
| 4 | Shell for bash tool? | **Bundle Git Bash** — included in installer, Pi auto-detects |
| 5 | pnpm or npm? | **pnpm** |

---

## Open Questions (Decide During Phase 0)

~None remaining — all decided.~

---

## Estimated Timeline

| Phase | Duration | Depends On |
|-------|----------|------------|
| Phase 0: Scaffold | 3-5 days | — |
| Phase 1: Chat UI | 5-7 days | Phase 0 |
| Phase 2: Sessions | 3-5 days | Phase 1 |
| Phase 3: Rich UI | 5-7 days | Phase 2 |
| Phase 4: Firm + Bundle | 5-7 days | Phase 3 |
| Phase 5: macOS | 3-5 days | Phase 4 |
| **Total** | **~5-6 weeks** | |

---

## References

- [Pi SDK Docs](/root/.nvm/versions/node/v22.22.3/lib/node_modules/@earendil-works/pi-coding-agent/docs/sdk.md)
- [Pi RPC Protocol](/root/.nvm/versions/node/v22.22.3/lib/node_modules/@earendil-works/pi-coding-agent/docs/rpc.md)
- [Tauri v2 Sidecar](https://v2.tauri.app/develop/sidecar/)
- [Tauri Shell Plugin](https://v2.tauri.app/plugin/shell/)
- [Node.js SEA API](https://nodejs.org/api/single-executable-applications.html)
- [openclaw/openclaw](https://github.com/openclaw/openclaw) — Pi SDK integration reference
