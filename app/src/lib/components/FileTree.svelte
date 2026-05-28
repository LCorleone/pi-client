<script lang="ts">
  import { listFiles, type FileEntry } from "../ipc.js";
  import { session } from "../stores/session.svelte.js";

  let expandedPaths = $state<Set<string>>(new Set());
  let loadedChildren = $state<Map<string, FileEntry[]>>(new Map());
  let filterText = $state("");
  let isLoading = $state(false);
  let rootEntries = $state<FileEntry[]>([]);

  // Load root directory when cwd changes
  $effect(() => {
    const cwd = session.cwd;
    if (cwd) {
      loadDirectory(cwd);
    }
  });

  async function loadDirectory(dir: string) {
    isLoading = true;
    try {
      const entries = await listFiles(dir);
      if (dir === session.cwd) {
        rootEntries = entries;
      } else {
        loadedChildren = new Map(loadedChildren).set(dir, entries);
      }
    } catch (err) {
      console.error("[FileTree] Failed to load directory:", err);
    } finally {
      isLoading = false;
    }
  }

  async function toggleExpand(path: string, isDir: boolean) {
    if (!isDir) return;
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
      // Lazy load children if not already loaded
      if (!loadedChildren.has(path)) {
        await loadDirectory(path);
      }
    }
    expandedPaths = newExpanded;
  }

  function getChildren(path: string): FileEntry[] {
    return loadedChildren.get(path) ?? [];
  }

  function fileIcon(name: string, isDir: boolean): string {
    if (isDir) return "📁";
    const ext = name.split(".").pop()?.toLowerCase() ?? "";
    switch (ext) {
      case "ts":
      case "tsx":
      case "js":
      case "jsx":
      case "mjs":
      case "cjs":
        return "📜";
      case "svelte":
      case "vue":
        return "🎨";
      case "css":
      case "scss":
      case "less":
        return "🎨";
      case "json":
      case "yaml":
      case "yml":
      case "toml":
        return "📋";
      case "md":
      case "txt":
      case "rst":
        return "📝";
      case "py":
        return "🐍";
      case "rs":
        return "🦀";
      case "go":
        return "🔵";
      case "java":
        return "☕";
      case "html":
      case "htm":
        return "🌐";
      case "svg":
      case "png":
      case "jpg":
      case "gif":
      case "webp":
        return "🖼️";
      case "lock":
        return "🔒";
      case "env":
      case "env.local":
        return "🔐";
      default:
        return "📄";
    }
  }

  function copyPath(path: string) {
    navigator.clipboard.writeText(path).catch(() => {});
  }

  // Filter entries based on search text
  function filterEntries(entries: FileEntry[]): FileEntry[] {
    if (!filterText) return entries;
    const lower = filterText.toLowerCase();
    return entries.filter(
      (e) =>
        e.name.toLowerCase().includes(lower) || e.is_dir
    );
  }

  let filteredRoot = $derived(filterEntries(rootEntries));
</script>

<div class="file-tree">
  <div class="tree-header">
    <span class="tree-title">Files</span>
  </div>

  <!-- Search -->
  <div class="tree-search">
    <input
      type="text"
      bind:value={filterText}
      placeholder="Filter files..."
      class="search-input"
    />
  </div>

  <!-- Tree content -->
  <div class="tree-content">
    {#if isLoading && rootEntries.length === 0}
      <div class="tree-empty">Loading...</div>
    {:else if rootEntries.length === 0}
      <div class="tree-empty">No files to display</div>
    {:else}
      {#each filteredRoot as entry (entry.path)}
        {@render treeNode(entry, 0)}
      {/each}
    {/if}
  </div>
</div>

{#snippet treeNode(entry: FileEntry, depth: number)}
  <div
    class="tree-node"
    class:is-dir={entry.is_dir}
    style="padding-left: {depth * 16 + 8}px"
    role="button"
    tabindex="0"
    onclick={() => entry.is_dir ? toggleExpand(entry.path, true) : copyPath(entry.path)}
    onkeydown={(e) => { if (e.key === "Enter") entry.is_dir ? toggleExpand(entry.path, true) : copyPath(entry.path); }}
    title={entry.path}
  >
    {#if entry.is_dir}
      <span class="expand-icon">{expandedPaths.has(entry.path) ? "▾" : "▸"}</span>
    {:else}
      <span class="expand-icon spacer"></span>
    {/if}
    <span class="file-icon">{fileIcon(entry.name, entry.is_dir)}</span>
    <span class="file-name">{entry.name}</span>
  </div>
  {#if entry.is_dir && expandedPaths.has(entry.path)}
    {#each filterEntries(getChildren(entry.path)) as child (child.path)}
      {@render treeNode(child, depth + 1)}
    {/each}
  {/if}
{/snippet}

<style>
  .file-tree {
    display: flex;
    flex-direction: column;
    height: 100%;
    user-select: none;
  }

  .tree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75em 1em;
    border-bottom: 1px solid var(--color-border, #27272a);
  }

  .tree-title {
    font-size: 0.85em;
    font-weight: 600;
    color: var(--color-text-secondary, #a1a1aa);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .tree-search {
    padding: 0.5em 0.75em;
    border-bottom: 1px solid var(--color-border, #27272a);
  }

  .search-input {
    width: 100%;
    padding: 0.35em 0.5em;
    border-radius: 6px;
    border: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-primary, #1a1a2e);
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.8em;
    outline: none;
    font-family: inherit;
  }

  .search-input:focus {
    border-color: var(--color-accent, #6366f1);
  }

  .search-input::placeholder {
    color: var(--color-text-muted, #71717a);
  }

  .tree-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.25em 0;
  }

  .tree-empty {
    padding: 1em;
    text-align: center;
    font-size: 0.85em;
    color: var(--color-text-muted, #71717a);
  }

  .tree-node {
    display: flex;
    align-items: center;
    gap: 0.3em;
    padding: 0.3em 0.75em;
    cursor: pointer;
    font-size: 0.8em;
    color: var(--color-text-primary, #e4e4e7);
    transition: background 0.1s;
    white-space: nowrap;
    overflow: hidden;
  }

  .tree-node:hover {
    background: rgba(255, 255, 255, 0.05);
  }

  .tree-node.is-dir {
    font-weight: 500;
  }

  .expand-icon {
    width: 1em;
    text-align: center;
    font-size: 0.75em;
    color: var(--color-text-secondary, #a1a1aa);
    flex-shrink: 0;
  }

  .spacer {
    visibility: hidden;
  }

  .file-icon {
    flex-shrink: 0;
    font-size: 0.9em;
  }

  .file-name {
    overflow: hidden;
    text-overflow: ellipsis;
    font-family: "JetBrains Mono", "Fira Code", "Cascadia Code", monospace;
    font-size: 0.9em;
  }
</style>
