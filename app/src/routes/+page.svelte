<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../lib/stores/session.svelte.js";
  import { sessions } from "../lib/stores/sessions.svelte.js";
  import { appSettings } from "../lib/stores/settings.svelte.js";
  import {
    initSession,
    pickDirectory,
    onAgentEvent,
    getModels,
    isTauriAvailable,
    sendPrompt,
    abortAgent,
    isBridgeReady,
  } from "../lib/ipc.js";
  import { registerShortcuts, Keys } from "../lib/utils/shortcuts.js";
  import { checkAndPromptForUpdates } from "../lib/utils/updater.js";
  import ChatPanel from "../lib/components/ChatPanel.svelte";
  import InputEditor from "../lib/components/InputEditor.svelte";
  import StatusBar from "../lib/components/StatusBar.svelte";
  import ModelSelector from "../lib/components/ModelSelector.svelte";
  import SessionList from "../lib/components/SessionList.svelte";
  import FileTree from "../lib/components/FileTree.svelte";
  import SettingsPanel from "../lib/components/SettingsPanel.svelte";
  import ThemeToggle from "../lib/components/ThemeToggle.svelte";
  import SetupWizard from "../lib/components/SetupWizard.svelte";

  let showWelcome = $state(true);
  let showSetup = $state(false);
  let sidebarTab = $state<"sessions" | "files">("sessions");
  let sidebarVisible = $state(true);
  let bridgeReady = $state(false);

  onMount(async () => {
    // If not running inside Tauri, show welcome with note
    if (!isTauriAvailable()) {
      console.log("[Pi Desktop] Running outside Tauri — some features disabled");
    }

    // Load settings
    await appSettings.loadSettings();

    // Check if first run (setup not completed)
    if (!appSettings.setupCompleted) {
      showSetup = true;
      showWelcome = false;
    }

    // Poll for bridge readiness (event may have fired before listener was attached)
    try {
      const ready = await isBridgeReady();
      if (ready) bridgeReady = true;
    } catch {
      // Not in Tauri or bridge not managed yet
    }

    // Listen for bridge events
    try {
      const unlisten = await onAgentEvent((event) => {
        session.handleAgentEvent(event as Record<string, unknown>);

        if (event.type === "agent_event") {
          const innerType = (event as Record<string, unknown>).event as string;

          // Auto-save on agent_end
          if (innerType === "agent_end") {
            sessions.onAgentEnd();
          }

          // Mark dirty during streaming so auto-save debounce kicks in
          if (
            innerType === "text_delta" ||
            innerType === "thinking_delta" ||
            innerType === "tool_call_start" ||
            innerType === "tool_call_update" ||
            innerType === "tool_call_end"
          ) {
            sessions.markDirty();
          }
        }
      });

      // Load session list
      await sessions.loadSessionList();

      // Listen for bridge spawn errors and readiness events
      try {
        const { listen } = await import("@tauri-apps/api/event");
        await listen<string>("bridge_error", (event) => {
          session.error = `Bridge error: ${event.payload}`;
        });
        await listen("bridge_ready", () => {
          bridgeReady = true;
        });
        await listen("bridge_exited", () => {
          bridgeReady = false;
        });
      } catch {
        // Not in Tauri — allow interaction anyway
        bridgeReady = true;
      }

      // Register keyboard shortcuts
      const unregister = registerShortcuts({
        [Keys.NEW_SESSION]: handleNewSession,
        [Keys.NEW_SESSION_FOLDER]: handlePickDirectory,
        [Keys.SETTINGS]: () => appSettings.openSettingsPanel(),
        [Keys.TOGGLE_SIDEBAR]: toggleSidebar,
        [Keys.CLEAR_CHAT]: handleNewSession,
        [Keys.TOGGLE_THEME]: () => appSettings.toggleTheme(),
      });

      // Check for updates (non-blocking, background)
      checkAndPromptForUpdates().catch(() => {});

      return () => {
        unlisten();
        unregister();
      };
    } catch {
      // Not in Tauri — that's fine for development
      console.log("[Pi Desktop] Event listener not available");
    }
  });

  async function handlePickDirectory() {
    if (!bridgeReady) {
      session.error = "Bridge is still starting up — please wait a moment.";
      return;
    }
    try {
      const dir = await pickDirectory();
      if (dir) {
        await sessions.createSession(dir);
        showWelcome = false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      session.error = msg || "Failed to initialize session";
    }
  }

  function handleChangeDirectory() {
    showWelcome = true;
  }

  function handleNewSession() {
    // Save current session before discarding
    if (sessions.currentSessionId && sessions.dirty) {
      sessions.saveCurrentSession();
    }
    session.reset();
    sessions.currentSessionId = null;
    showWelcome = true;
  }

  function toggleSidebar() {
    sidebarVisible = !sidebarVisible;
  }

  // Listen for new-session event from SessionList
  onMount(() => {
    const handler = () => {
      handlePickDirectory();
    };
    window.addEventListener("new-session", handler);

    // Listen for setup wizard completion
    const setupHandler = () => {
      showSetup = false;
      // Just show the welcome screen — user will click "Open Folder" normally
      // Trying to createSession here can fail if bridge sidecar isn't ready yet
      showWelcome = true;
    };
    window.addEventListener("setup-complete", setupHandler);

    return () => {
      window.removeEventListener("new-session", handler);
      window.removeEventListener("setup-complete", setupHandler);
    };
  });
</script>

<SettingsPanel />

{#if showSetup}
  <SetupWizard />
{:else}
  <div class="app-shell">
    {#if showWelcome}
      <!-- Welcome / directory picker -->
      <div class="welcome-screen">
        <div class="welcome-card">
          <div class="welcome-logo">🤖</div>
          <div class="welcome-title">Pi Desktop</div>
          <p class="welcome-subtitle">Your AI coding assistant</p>
          <p class="welcome-desc">Select a project folder to begin a coding session</p>

          <button onclick={handlePickDirectory} class="welcome-btn" disabled={!bridgeReady}>
            {#if bridgeReady}
              <span class="btn-icon">📁</span>
              Open Folder
            {:else}
              <span class="btn-icon">⏳</span>
              Preparing environment…
            {/if}
          </button>

          {#if !isTauriAvailable()}
            <p class="welcome-note">
              ⚠️ Running in browser mode — connect from Tauri for full functionality
            </p>
          {/if}

          {#if session.error}
            <p class="welcome-error">{session.error}</p>
          {/if}

          <!-- Show recent sessions -->
          {#if sessions.hasSessions}
            <div class="recent-sessions">
              <div class="recent-title">Recent Sessions</div>
              {#each sessions.sessions.slice(0, 5) as s (s.id)}
                <button
                  class="recent-item"
                  onclick={() => { sessions.switchSession(s.id); showWelcome = false; }}
                >
                  <span class="recent-icon">📁</span>
                  <div class="recent-info">
                    <span class="recent-name">{s.name}</span>
                    <span class="recent-meta">{sessions.relativeTime(s.updatedAt)} · {s.messageCount} messages</span>
                  </div>
                </button>
              {/each}
            </div>
          {/if}

          <!-- Re-run setup button -->
          <button class="setup-again-btn" onclick={() => { showSetup = true; showWelcome = false; }}>
            ⚙️ Re-run Setup Wizard
          </button>
        </div>
      </div>
    {:else}
      <!-- Main chat interface -->
      <div class="main-layout">
        <!-- Sidebar -->
        {#if sidebarVisible}
          <aside class="sidebar">
            <div class="sidebar-tabs">
              <button
                class="sidebar-tab"
                class:active={sidebarTab === "sessions"}
                onclick={() => (sidebarTab = "sessions")}
              >
                💬 Sessions
              </button>
              <button
                class="sidebar-tab"
                class:active={sidebarTab === "files"}
                onclick={() => (sidebarTab = "files")}
              >
                📁 Files
              </button>
            </div>

            <div class="sidebar-panel">
              {#if sidebarTab === "sessions"}
                <SessionList />
              {:else}
                <FileTree />
              {/if}
            </div>
          </aside>
        {/if}

        <!-- Main content -->
        <div class="chat-layout">
          <!-- Top bar -->
          <header class="top-bar">
            <div class="top-bar-left">
              <button
                onclick={toggleSidebar}
                class="icon-btn"
                title="Toggle sidebar (Ctrl+B)"
              >
                {sidebarVisible ? "◀" : "▶"}
              </button>
              <span class="app-name">Pi Desktop</span>
              {#if session.cwd}
                <span class="cwd-display" title={session.cwd}>📁 {session.cwd}</span>
              {/if}
            </div>
            <div class="top-bar-right">
              <ModelSelector />
              <ThemeToggle />
              <button
                onclick={() => appSettings.openSettingsPanel()}
                class="icon-btn"
                title="Settings (Ctrl+,)"
              >
                ⚙️
              </button>
              <button
                onclick={handleNewSession}
                class="icon-btn"
                title="New session (Ctrl+N)"
              >
                ➕
              </button>
              <button
                onclick={handleChangeDirectory}
                class="icon-btn"
                title="Change directory"
              >
                📂
              </button>
            </div>
          </header>

          <!-- Chat area -->
          <div class="chat-area">
            <ChatPanel />
          </div>

          <!-- Input area -->
          <InputEditor />

          <!-- Status bar -->
          <StatusBar />
        </div>
      </div>
    {/if}
  </div>
{/if}

<style>
  .app-shell {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background: var(--color-bg-primary);
    overflow: hidden;
  }

  /* ── Welcome Screen ────────────────────────────── */

  .welcome-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
  }

  .welcome-card {
    text-align: center;
    max-width: 420px;
    padding: 3em 2em;
  }

  .welcome-logo {
    font-size: 4em;
    margin-bottom: 0.5em;
  }

  .welcome-title {
    font-size: 2em;
    font-weight: 700;
    color: var(--color-accent);
    margin-bottom: 0.25em;
  }

  .welcome-subtitle {
    font-size: 1.1em;
    color: var(--color-text-secondary);
    margin: 0 0 1em;
  }

  .welcome-desc {
    font-size: 0.9em;
    color: var(--color-text-secondary);
    margin: 0 0 2em;
  }

  .welcome-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.75em 2em;
    border-radius: 12px;
    border: none;
    background: var(--color-accent);
    color: white;
    font-size: 1em;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.2s, transform 0.1s, opacity 0.2s;
  }

  .welcome-btn:hover {
    background: var(--color-accent-hover);
  }

  .welcome-btn:active {
    transform: scale(0.98);
  }

  .welcome-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transform: none;
  }

  .welcome-btn:disabled:hover {
    background: var(--color-accent);
  }

  .btn-icon {
    font-size: 1.1em;
  }

  .welcome-note {
    margin-top: 1.5em;
    font-size: 0.8em;
    color: var(--color-text-secondary);
    opacity: 0.7;
  }

  .welcome-error {
    margin-top: 1em;
    font-size: 0.85em;
    color: #ef4444;
  }

  .setup-again-btn {
    margin-top: 2em;
    padding: 0.4em 1em;
    border-radius: 8px;
    border: 1px solid var(--color-border);
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 0.8em;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
  }

  .setup-again-btn:hover {
    border-color: var(--color-accent);
    color: var(--color-accent);
  }

  /* ── Recent Sessions ───────────────────────────── */

  .recent-sessions {
    margin-top: 2em;
    text-align: left;
  }

  .recent-title {
    font-size: 0.8em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary);
    margin-bottom: 0.5em;
  }

  .recent-item {
    display: flex;
    align-items: center;
    gap: 0.6em;
    width: 100%;
    padding: 0.5em 0.75em;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--color-text-primary);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .recent-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .recent-icon {
    font-size: 1em;
  }

  .recent-info {
    display: flex;
    flex-direction: column;
  }

  .recent-name {
    font-size: 0.85em;
    font-weight: 500;
  }

  .recent-meta {
    font-size: 0.7em;
    color: var(--color-text-muted);
  }

  /* ── Main Layout ───────────────────────────────── */

  .main-layout {
    display: flex;
    flex: 1;
    height: 100%;
    overflow: hidden;
  }

  /* ── Sidebar ────────────────────────────────────── */

  .sidebar {
    display: flex;
    flex-direction: column;
    width: 260px;
    min-width: 260px;
    border-right: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    height: 100%;
  }

  .sidebar-tabs {
    display: flex;
    border-bottom: 1px solid var(--color-border);
  }

  .sidebar-tab {
    flex: 1;
    padding: 0.6em;
    border: none;
    background: transparent;
    color: var(--color-text-secondary);
    font-size: 0.8em;
    cursor: pointer;
    text-align: center;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    font-family: inherit;
  }

  .sidebar-tab:hover {
    color: var(--color-text-primary);
  }

  .sidebar-tab.active {
    color: var(--color-accent);
    border-bottom-color: var(--color-accent);
  }

  .sidebar-panel {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  /* ── Chat Layout ───────────────────────────────── */

  .chat-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
    height: 100%;
    min-width: 0;
  }

  /* ── Top Bar ────────────────────────────────────── */

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5em 1em;
    border-bottom: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
    flex-shrink: 0;
  }

  .top-bar-left {
    display: flex;
    align-items: center;
    gap: 0.5em;
    min-width: 0;
  }

  .app-name {
    font-size: 0.9em;
    font-weight: 600;
    color: var(--color-text-secondary);
    white-space: nowrap;
  }

  .cwd-display {
    font-size: 0.75em;
    color: var(--color-text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 300px;
  }

  .top-bar-right {
    display: flex;
    align-items: center;
    gap: 0.35em;
  }

  .icon-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    border: none;
    background: transparent;
    cursor: pointer;
    font-size: 0.85em;
    transition: background 0.15s;
  }

  .icon-btn:hover {
    background: var(--color-border);
  }

  /* ── Chat Area ──────────────────────────────────── */

  .chat-area {
    flex: 1;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }
</style>
