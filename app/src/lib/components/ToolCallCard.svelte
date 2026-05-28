<script lang="ts">
  import type { ToolCall } from "../stores/session.svelte.js";
  import MarkdownRenderer from "./MarkdownRenderer.svelte";
  import DiffViewer from "./DiffViewer.svelte";

  let { toolCall }: { toolCall: ToolCall } = $props();

  let collapsed = $state(false);

  function toggle() {
    collapsed = !collapsed;
  }

  // Icon + description based on tool type
  let meta = $derived.by(() => {
    const name = toolCall.name;
    const args = toolCall.args;

    switch (name) {
      case "bash":
        return {
          icon: "🔧",
          description: typeof args.command === "string" ? args.command : name,
          lang: "bash",
        };
      case "read":
        return {
          icon: "📄",
          description: typeof args.path === "string" ? args.path : name,
          lang: "",
        };
      case "edit":
        return {
          icon: "✏️",
          description: typeof args.path === "string" ? args.path : name,
          lang: "diff",
        };
      case "write":
        return {
          icon: "📝",
          description: typeof args.path === "string" ? args.path : name,
          lang: "",
        };
      case "search":
        return {
          icon: "🔍",
          description: typeof args.query === "string" ? args.query : name,
          lang: "",
        };
      case "web_fetch":
        return {
          icon: "🌐",
          description: typeof args.url === "string" ? args.url : name,
          lang: "",
        };
      default:
        return {
          icon: "⚙️",
          description: name,
          lang: "",
        };
    }
  });

  let statusIcon = $derived.by(() => {
    switch (toolCall.status) {
      case "running":
        return "🟡";
      case "done":
        return "✅";
      case "error":
        return "❌";
    }
  });

  let displayOutput = $derived(toolCall.output || toolCall.partialOutput || "");

  // For edit tool, extract oldText/newText from args for proper diff
  let editDiff = $derived.by(() => {
    if (toolCall.name !== "edit") return null;
    const args = toolCall.args;
    const oldText = typeof args.oldText === "string" ? args.oldText : "";
    const newText = typeof args.newText === "string" ? args.newText : "";
    if (!oldText && !newText) return null;
    return {
      oldText,
      newText,
      fileName: typeof args.path === "string" ? args.path : undefined,
    };
  });
</script>

<div class="tool-card">
  <button
    onclick={toggle}
    class="tool-header"
    type="button"
  >
    <span class="arrow">{collapsed ? "▸" : "▾"}</span>
    <span class="tool-icon">{meta.icon}</span>
    <span class="tool-name">{toolCall.name}</span>
    <span class="tool-desc">{meta.description}</span>
    <span class="tool-status">{statusIcon}</span>
  </button>

  {#if !collapsed}
    <div class="tool-body">
      {#if Object.keys(toolCall.args).length > 0}
        <div class="tool-section">
          <div class="section-label">Arguments</div>
          <pre class="args-block">{JSON.stringify(toolCall.args, null, 2)}</pre>
        </div>
      {/if}

      {#if displayOutput}
        <div class="tool-section">
          <div class="section-label">Output</div>
          {#if editDiff}
            <DiffViewer oldText={editDiff.oldText} newText={editDiff.newText} fileName={editDiff.fileName} />
          {:else if toolCall.name === "bash"}
            <pre class="output-block">{displayOutput}</pre>
          {:else if toolCall.name === "read"}
            <pre class="output-block line-numbers">{displayOutput}</pre>
          {:else}
            <div class="output-markdown">
              <MarkdownRenderer text={displayOutput} />
            </div>
          {/if}
        </div>
      {/if}

      {#if toolCall.status === "running" && !displayOutput}
        <div class="tool-running">
          <span class="running-dots">Running</span>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .tool-card {
    margin-top: 0.5em;
    border: 1px solid var(--color-border, #27272a);
    border-radius: 8px;
    overflow: hidden;
    font-size: 0.9em;
  }

  .tool-header {
    display: flex;
    align-items: center;
    gap: 0.5em;
    width: 100%;
    padding: 0.5em 0.75em;
    background: rgba(255, 255, 255, 0.03);
    border: none;
    color: var(--color-text-primary, #e4e4e7);
    cursor: pointer;
    font-size: 0.85em;
    text-align: left;
    transition: background 0.15s;
  }

  .tool-header:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .arrow {
    font-size: 0.8em;
    width: 1em;
    text-align: center;
    color: var(--color-text-secondary, #a1a1aa);
  }

  .tool-icon {
    font-size: 1em;
  }

  .tool-name {
    font-weight: 600;
    color: var(--color-accent, #6366f1);
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 0.85em;
  }

  .tool-desc {
    flex: 1;
    color: var(--color-text-secondary, #a1a1aa);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 0.85em;
  }

  .tool-status {
    font-size: 0.8em;
  }

  .tool-body {
    padding: 0.75em;
    border-top: 1px solid var(--color-border, #27272a);
  }

  .tool-section {
    margin-bottom: 0.5em;
  }

  .tool-section:last-child {
    margin-bottom: 0;
  }

  .section-label {
    font-size: 0.75em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary, #a1a1aa);
    margin-bottom: 0.4em;
  }

  .args-block,
  .output-block {
    margin: 0;
    padding: 0.75em;
    background: #0d1117;
    border-radius: 6px;
    overflow-x: auto;
    max-height: 300px;
    overflow-y: auto;
    font-size: 0.8em;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-all;
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    color: #c9d1d9;
  }

  .output-markdown {
    max-height: 300px;
    overflow-y: auto;
    padding: 0.5em;
  }

  .tool-running {
    padding: 0.5em 0.75em;
    color: var(--color-text-secondary, #a1a1aa);
    font-size: 0.85em;
  }

  .running-dots {
    animation: pulse-dots 1.5s ease-in-out infinite;
  }

  @keyframes pulse-dots {
    0%,
    100% {
      opacity: 0.4;
    }
    50% {
      opacity: 1;
    }
  }
</style>
