<script lang="ts">
  let { content, initiallyCollapsed = true }: { content: string; initiallyCollapsed?: boolean } = $props();

  let collapsed = $state(initiallyCollapsed);

  function toggle() {
    collapsed = !collapsed;
  }
</script>

<div class="thinking-block">
  <button
    onclick={toggle}
    class="thinking-header"
    type="button"
  >
    <span class="arrow">{collapsed ? "▸" : "▾"}</span>
    <span class="label">💭 Thinking{collapsed ? "..." : ""}</span>
    <span class="badge">{collapsed ? "hidden" : `${content.length} chars`}</span>
  </button>
  {#if !collapsed}
    <div class="thinking-content">
      <pre class="thinking-text">{content}</pre>
    </div>
  {/if}
</div>

<style>
  .thinking-block {
    margin-top: 0.5em;
    border: 1px solid var(--color-border, #27272a);
    border-radius: 8px;
    overflow: hidden;
  }

  .thinking-header {
    display: flex;
    align-items: center;
    gap: 0.5em;
    width: 100%;
    padding: 0.5em 0.75em;
    background: rgba(255, 255, 255, 0.03);
    border: none;
    color: var(--color-text-secondary, #a1a1aa);
    cursor: pointer;
    font-size: 0.85em;
    text-align: left;
    transition: background 0.15s;
  }

  .thinking-header:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .arrow {
    font-size: 0.8em;
    width: 1em;
    text-align: center;
  }

  .label {
    flex: 1;
    font-style: italic;
  }

  .badge {
    font-size: 0.85em;
    opacity: 0.6;
  }

  .thinking-content {
    padding: 0.75em 1em;
    border-top: 1px solid var(--color-border, #27272a);
    max-height: 300px;
    overflow-y: auto;
  }

  .thinking-text {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.8em;
    line-height: 1.5;
    color: var(--color-text-secondary, #a1a1aa);
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
  }
</style>
