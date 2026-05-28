<script lang="ts">
  import { onMount } from "svelte";
  import { session } from "../lib/stores/session.svelte.js";
  import { sessions } from "../lib/stores/sessions.svelte.js";
  import {
    pickDirectory,
    onAgentEvent,
    getModels,
    isTauriAvailable,
  } from "../lib/ipc.js";
  import ChatPanel from "../lib/components/ChatPanel.svelte";
  import InputEditor from "../lib/components/InputEditor.svelte";
  import StatusBar from "../lib/components/StatusBar.svelte";
  import ModelSelector from "../lib/components/ModelSelector.svelte";
  import SessionList from "../lib/components/SessionList.svelte";

  let showWelcome = $state(false);
  let appInitialized = $state(false);

  onMount(async () => {
    // If not running inside Tauri, show welcome with note
    if (!isTauriAvailable()) {
      console.log("[Pi Desktop] Running outside Tauri — some features disabled");
    }

    // Listen for bridge events
    try {
      const unlisten = await onAgentEvent((event) => {
        session.handleAgentEvent(event as Record<string, unknown>);

        // Notify sessions store about agent_end for auto-save
        if (
          event.type === "agent_event" &&
          (event as Record<string, unknown>).event === "agent_end"
        ) {
          sessions.onAgentEnd();
        }

        // Mark session as dirty on content changes
        if (
          event.type === "agent_event" &&
          ["text_delta", "thinking_delta", "tool_call_end", "message_end"].includes(
            (event as Record<string, unknown>).event as string
          )
        ) {
          sessions.markDirty();
        }
      });

      return unlisten;
    } catch {
      // Not in Tauri — that's fine for development
      console.log("[Pi Desktop] Event listener not available");
    }
  });

  // Auto-load sessions on mount
  $effect(() => {
    if (isTauriAvailable()) {
      sessions.loadSessionList().then(() => {
        appInitialized = true;
        // If there are existing sessions, auto-select the most recent
        if (sessions.hasSessions && sessions.sessions.length > 0) {
          const lastSession = sessions.sessions[0];
          handleSelectSession(lastSession.id);
        } else {
          showWelcome = true;
        }
      });
    } else {
      appInitialized = true;
      showWelcome = true;
    }
  });

  async function handlePickDirectory() {
    try {
      const dir = await pickDirectory();
      if (dir) {
        await sessions.createSession(dir);
        showWelcome = false;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to initialize session";
      session.error = msg;
    }
  }

  async function handleSelectSession(id: string) {
    await sessions.switchSession(id);
    showWelcome = false;
  }

  function handleNewSession() {
    // Show the welcome / folder picker
    showWelcome = true;
  }

  // Listen for new-session event from SessionList
  $effect(() => {
    const handler = () => handleNewSession();
    window.addEventListener("new-session", handler);
    return () => window.removeEventListener("new-session", handler);
  });
</script>

<div class="app-shell">
  {#if showWelcome}
    <!-- Welcome / directory picker -->
    <div class="welcome-screen">
      <div class="welcome-card">
        <div class="welcome-logo">🤖</div>
        <div class="welcome-title">Pi Desktop</div>
        <p class="welcome-subtitle">Your AI coding assistant</p>
        <p class="welcome-desc">Select a project folder to begin a coding session</p>

        <button onclick={handlePickDirectory} class="welcome-btn">
          <span class="btn-icon">📁</span>
          Open Folder
        </button>

        {#if !isTauriAvailable()}
          <p class="welcome-note">
            ⚠️ Running in browser mode — connect from Tauri for full functionality
          </p>
        {/if}

        {#if session.error}
          <p class="welcome-error">{session.error}</p>
        {/if}
      </div>
    </div>
  {:else}
    <!-- Main layout with sidebar -->
    <div class="main-layout">
      {#if sessions.showSidebar}
        <SessionList />
      {/if}

      <div class="chat-layout">
        <!-- Top bar -->
        <header class="top-bar">
          <div class="top-bar-left">
            <button
              onclick={() => sessions.toggleSidebar()}
              class="icon-btn"
              title="Toggle sidebar"
            >
              {sessions.showSidebar ? "◀" : "▶"}
            </button>
            <span class="app-name">Pi Desktop</span>
            {#if session.cwd}
              <span class="cwd-display" title={session.cwd}>📁 {session.cwd}</span>
            {/if}
          </div>
          <div class="top-bar-right">
            <ModelSelector />
            <button
              onclick={handleNewSession}
              class="icon-btn"
              title="New session"
            >
              ➕
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
    transition: background 0.2s, transform 0.1s;
  }

  .welcome-btn:hover {
    background: var(--color-accent-hover);
  }

  .welcome-btn:active {
    transform: scale(0.98);
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

  /* ── Main Layout ───────────────────────────────── */

  .main-layout {
    display: flex;
    height: 100%;
  }

  /* ── Chat Layout ───────────────────────────────── */

  .chat-layout {
    display: flex;
    flex-direction: column;
    flex: 1;
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
    max-width: 250px;
  }

  .top-bar-right {
    display: flex;
    align-items: center;
    gap: 0.5em;
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
    color: var(--color-text-secondary);
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
