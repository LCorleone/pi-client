<script lang="ts">
  import * as Diff from "diff";

  let {
    oldText,
    newText,
    fileName,
    maxHeight = 400,
  }: {
    oldText: string;
    newText: string;
    fileName?: string;
    maxHeight?: number;
  } = $props();

  let expanded = $state(false);

  interface DiffLine {
    type: "added" | "removed" | "context" | "hunk";
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
  }

  let diffLines = $derived.by(() => {
    if (!oldText && !newText) return [];

    const patch = Diff.createPatch(fileName ?? "file", oldText, newText, "", "");
    const lines = patch.split("\n");
    const result: DiffLine[] = [];

    let oldLine = 0;
    let newLine = 0;

    for (const line of lines) {
      // Skip the header lines (---, +++, index)
      if (line.startsWith("---") || line.startsWith("+++")) continue;
      if (line.startsWith("Index:")) continue;
      if (line.startsWith("diff --git")) continue;

      // Parse hunk header @@ -old,count +new,count @@
      if (line.startsWith("@@")) {
        const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
        if (match) {
          oldLine = parseInt(match[1], 10);
          newLine = parseInt(match[2], 10);
        }
        result.push({ type: "hunk", content: line });
        continue;
      }

      if (line.startsWith("+")) {
        result.push({
          type: "added",
          content: line.slice(1),
          newLineNum: newLine++,
        });
      } else if (line.startsWith("-")) {
        result.push({
          type: "removed",
          content: line.slice(1),
          oldLineNum: oldLine++,
        });
      } else if (line.startsWith(" ")) {
        result.push({
          type: "context",
          content: line.slice(1),
          oldLineNum: oldLine++,
          newLineNum: newLine++,
        });
      }
      // Skip empty lines at end of patch
    }

    return result;
  });

  let isLarge = $derived(diffLines.length > 50);
  let visibleLines = $derived(
    expanded || !isLarge ? diffLines : diffLines.slice(0, 50)
  );

  let stats = $derived.by(() => {
    let added = 0;
    let removed = 0;
    for (const line of diffLines) {
      if (line.type === "added") added++;
      if (line.type === "removed") removed++;
    }
    return { added, removed };
  });
</script>

<div class="diff-viewer">
  {#if fileName}
    <div class="diff-header">
      <span class="diff-filename">{fileName}</span>
      <span class="diff-stats">
        <span class="stat-added">+{stats.added}</span>
        <span class="stat-removed">-{stats.removed}</span>
      </span>
    </div>
  {/if}

  <div class="diff-content" style="max-height: {maxHeight}px">
    <table class="diff-table">
      <tbody>
        {#each visibleLines as line (line)}
          <tr class="diff-line diff-line-{line.type}">
            <td class="line-num line-num-old">
              {line.oldLineNum ?? ""}
            </td>
            <td class="line-num line-num-new">
              {line.newLineNum ?? ""}
            </td>
            <td class="line-prefix">
              {#if line.type === "added"}+{:else if line.type === "removed"}-{:else}{line.type === "hunk" ? "@" : " "}{/if}
            </td>
            <td class="line-content">{line.content}</td>
          </tr>
        {/each}
      </tbody>
    </table>

    {#if isLarge && !expanded}
      <button class="expand-btn" onclick={() => (expanded = true)}>
        Show all {diffLines.length} lines ({diffLines.length - 50} more)
      </button>
    {/if}
  </div>
</div>

<style>
  .diff-viewer {
    border-radius: 6px;
    overflow: hidden;
    border: 1px solid var(--color-border, #27272a);
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 0.8em;
    line-height: 1.5;
  }

  .diff-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4em 0.75em;
    background: rgba(255, 255, 255, 0.03);
    border-bottom: 1px solid var(--color-border, #27272a);
  }

  .diff-filename {
    font-weight: 600;
    color: var(--color-text-primary, #e4e4e7);
  }

  .diff-stats {
    display: flex;
    gap: 0.75em;
    font-size: 0.85em;
  }

  .stat-added {
    color: #4ade80;
  }

  .stat-removed {
    color: #f87171;
  }

  .diff-content {
    overflow: auto;
    background: #0d1117;
  }

  .diff-table {
    width: 100%;
    border-collapse: collapse;
  }

  .diff-line {
    margin: 0;
  }

  .diff-line-added {
    background: rgba(34, 197, 94, 0.12);
  }

  .diff-line-removed {
    background: rgba(239, 68, 68, 0.12);
  }

  .diff-line-hunk {
    background: rgba(96, 165, 250, 0.08);
  }

  .diff-line-context {
    background: transparent;
  }

  .line-num {
    padding: 0 0.5em;
    min-width: 3em;
    text-align: right;
    color: rgba(255, 255, 255, 0.25);
    user-select: none;
    white-space: nowrap;
    vertical-align: top;
  }

  .line-prefix {
    padding: 0 0.25em;
    color: rgba(255, 255, 255, 0.4);
    user-select: none;
    white-space: nowrap;
    vertical-align: top;
  }

  .diff-line-added .line-prefix {
    color: #4ade80;
  }

  .diff-line-removed .line-prefix {
    color: #f87171;
  }

  .diff-line-hunk .line-prefix {
    color: #60a5fa;
  }

  .line-content {
    white-space: pre-wrap;
    word-break: break-all;
    color: #c9d1d9;
    padding-right: 0.75em;
  }

  .diff-line-added .line-content {
    color: #aff5b4;
  }

  .diff-line-removed .line-content {
    color: #ffdcd7;
  }

  .diff-line-hunk .line-content {
    color: #60a5fa;
  }

  .expand-btn {
    display: block;
    width: 100%;
    padding: 0.5em;
    border: none;
    border-top: 1px solid var(--color-border, #27272a);
    background: rgba(255, 255, 255, 0.03);
    color: var(--color-accent, #6366f1);
    font-size: 0.85em;
    cursor: pointer;
    text-align: center;
    font-family: inherit;
  }

  .expand-btn:hover {
    background: rgba(99, 102, 241, 0.1);
  }
</style>
