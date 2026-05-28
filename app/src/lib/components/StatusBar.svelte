<script lang="ts">
  import { session } from "../stores/session.svelte.js";

  let statusText = $derived(session.isStreaming ? "Streaming" : "Ready");
  let modelText = $derived(session.currentModel ? session.currentModel.name : "No model");
  let sessionText = $derived(
    session.sessionId
      ? session.sessionId.length > 8
        ? session.sessionId.slice(0, 8) + "…"
        : session.sessionId
      : "—"
  );
</script>

<div class="status-bar">
  <div class="status-left">
    <span class="status-model">🤖 {modelText}</span>
    <span class="status-divider">|</span>
    {#if session.isStreaming}
      <span class="status-streaming">
        <span class="dot-pulse"></span>
        {statusText}
      </span>
    {:else}
      <span class="status-ready">{statusText}</span>
    {/if}
  </div>
  <div class="status-right">
    <span>💬 {session.messageCount}</span>
    <span class="status-divider">|</span>
    <span>🔑 {sessionText}</span>
  </div>
</div>

<style>
  .status-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.25em 1em;
    border-top: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-secondary, #16213e);
    font-size: 0.75em;
    color: var(--color-text-secondary, #a1a1aa);
    flex-shrink: 0;
  }

  .status-left,
  .status-right {
    display: flex;
    align-items: center;
    gap: 0.5em;
  }

  .status-divider {
    opacity: 0.3;
  }

  .status-streaming {
    display: flex;
    align-items: center;
    gap: 0.4em;
    color: var(--color-accent, #6366f1);
    font-weight: 500;
  }

  .dot-pulse {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--color-accent, #6366f1);
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 0.3;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1.2);
    }
  }

  .status-ready {
    color: #22c55e;
  }

  .status-model {
    max-width: 150px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
