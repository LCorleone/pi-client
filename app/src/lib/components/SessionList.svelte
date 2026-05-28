<script lang="ts">
  import { sessions } from "../stores/sessions.svelte.js";
  import { pickDirectory } from "../ipc.js";

  let editingId: string | null = $state(null);
  let editingName = $state("");

  function handleNewSession() {
    // Trigger the parent's new session flow
    // This is handled by dispatching a custom event
    const event = new CustomEvent("new-session");
    window.dispatchEvent(event);
  }

  function handleSelect(id: string) {
    if (id === sessions.currentSessionId) return;
    sessions.switchSession(id);
  }

  function handleDelete(id: string, e: MouseEvent) {
    e.stopPropagation();
    if (confirm("Delete this session? Chat history will be lost.")) {
      sessions.removeSession(id);
    }
  }

  function startRename(id: string, currentName: string, e: MouseEvent) {
    e.stopPropagation();
    editingId = id;
    editingName = currentName;
  }

  function commitRename() {
    if (editingId && editingName.trim()) {
      sessions.renameSession(editingId, editingName.trim());
    }
    editingId = null;
    editingName = "";
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    }
    if (e.key === "Escape") {
      editingId = null;
      editingName = "";
    }
  }

  let showActions = $state<string | null>(null);

  function toggleActions(id: string, e: MouseEvent) {
    e.stopPropagation();
    showActions = showActions === id ? null : id;
  }

  function handleClickOutside() {
    showActions = null;
  }
</script>

<svelte:window onclick={handleClickOutside} />

<div class="session-sidebar">
  <div class="session-list">
    {#if sessions.sessions.length === 0}
      <div class="empty-sessions">
        <p>No sessions yet</p>
        <p class="empty-hint">Open a folder to start</p>
      </div>
    {:else}
      {#each sessions.sessions as s (s.id)}
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          class="session-item"
          class:active={s.id === sessions.currentSessionId}
          onclick={() => handleSelect(s.id)}
          onkeydown={(e) => { if (e.key === "Enter") handleSelect(s.id); }}
          role="button"
          tabindex="0"
        >
          <div class="session-icon">📁</div>
          <div class="session-info">
            {#if editingId === s.id}
              <input
                type="text"
                bind:value={editingName}
                onkeydown={handleRenameKeydown}
                onblur={commitRename}
                class="rename-input"
                onclick={(e) => e.stopPropagation()}
              />
            {:else}
              <div class="session-name">{s.name}</div>
              <div class="session-meta">
                <span class="session-messages">💬 {s.messageCount}</span>
                <span class="session-time">{sessions.relativeTime(s.updatedAt)}</span>
              </div>
            {/if}
          </div>
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="session-actions" role="group" onclick={(e) => toggleActions(s.id, e)} onkeydown={() => {}}>
            <span class="action-dots">⋯</span>
            {#if showActions === s.id}
              <!-- svelte-ignore a11y_interactive_supports_focus -->
              <div class="action-menu" role="menu" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>                <button
                  class="action-item"
                  role="menuitem"
                  onclick={(e) => startRename(s.id, s.name, e)}
                >
                  ✏️ Rename
                </button>
                <button
                  class="action-item action-delete"
                  role="menuitem"
                  onclick={(e) => handleDelete(s.id, e)}
                >
                  🗑️ Delete
                </button>
              </div>
            {/if}
          </div>
        </div>
      {/each}
    {/if}
  </div>

  <div class="sidebar-footer">
    <button class="new-session-btn" onclick={handleNewSession}>
      <span class="btn-icon">＋</span>
      New Session
    </button>
  </div>
</div>

<style>
  .session-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    user-select: none;
  }

  /* ── Session List ────────────────────────── */

  .session-list {
    flex: 1;
    overflow-y: auto;
    padding: 0.5em 0;
  }

  .empty-sessions {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2em 1em;
    text-align: center;
    color: var(--color-text-muted, #71717a);
  }

  .empty-sessions p {
    margin: 0.25em 0;
    font-size: 0.85em;
  }

  .empty-hint {
    font-size: 0.75em !important;
    opacity: 0.7;
  }

  .session-item {
    display: flex;
    align-items: center;
    gap: 0.6em;
    width: 100%;
    padding: 0.6em 0.75em;
    border: none;
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
    position: relative;
  }

  .session-item:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .session-item.active {
    background: rgba(99, 102, 241, 0.15);
    border-left: 3px solid var(--color-accent, #6366f1);
    padding-left: calc(0.75em - 3px);
  }

  .session-icon {
    font-size: 1em;
    flex-shrink: 0;
  }

  .session-info {
    flex: 1;
    min-width: 0;
  }

  .session-name {
    font-size: 0.85em;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .session-meta {
    display: flex;
    align-items: center;
    gap: 0.5em;
    font-size: 0.7em;
    color: var(--color-text-muted, #71717a);
    margin-top: 0.15em;
  }

  .rename-input {
    width: 100%;
    padding: 0.2em 0.4em;
    border-radius: 4px;
    border: 1px solid var(--color-accent, #6366f1);
    background: var(--color-bg-primary, #1a1a2e);
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.85em;
    outline: none;
  }

  /* ── Actions Menu ────────────────────────── */

  .session-actions {
    position: relative;
    flex-shrink: 0;
  }

  .action-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    font-size: 0.9em;
    color: var(--color-text-muted, #71717a);
    opacity: 0;
    transition: opacity 0.15s;
  }

  .session-item:hover .action-dots {
    opacity: 1;
  }

  .session-item.active .action-dots {
    opacity: 1;
  }

  .action-menu {
    position: absolute;
    right: 0;
    top: 100%;
    min-width: 140px;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-secondary, #16213e);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
    z-index: 50;
    overflow: hidden;
  }

  .action-item {
    display: flex;
    align-items: center;
    gap: 0.5em;
    width: 100%;
    padding: 0.5em 0.75em;
    border: none;
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.8em;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .action-item:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .action-delete:hover {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
  }

  /* ── Footer ──────────────────────────────── */

  .sidebar-footer {
    padding: 0.5em 0.75em;
    border-top: 1px solid var(--color-border, #27272a);
  }

  .new-session-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5em;
    width: 100%;
    padding: 0.6em;
    border-radius: 8px;
    border: 1px dashed var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-secondary, #a1a1aa);
    font-size: 0.85em;
    cursor: pointer;
    transition: all 0.15s;
  }

  .new-session-btn:hover {
    border-color: var(--color-accent, #6366f1);
    color: var(--color-accent, #6366f1);
    background: rgba(99, 102, 241, 0.1);
  }

  .btn-icon {
    font-size: 1em;
  }
</style>
