<script lang="ts">
  import { setModel } from "../ipc.js";
  import { session } from "../stores/session.svelte.js";

  let open = $state(false);

  function toggle() {
    open = !open;
  }

  function close() {
    open = false;
  }

  async function selectModel(model: { provider: string; id: string; name: string }) {
    try {
      await setModel(model.provider, model.id);
      session.currentModel = model;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to set model";
      session.error = msg;
    }
    close();
  }

  function handleClickOutside(e: MouseEvent) {
    if (open) {
      close();
    }
  }

  let displayLabel = $derived(
    session.currentModel
      ? session.currentModel.name
      : "No model"
  );
</script>

<svelte:window onclick={handleClickOutside} />

<div class="model-selector" role="listbox" tabindex="0" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
  <button
    onclick={toggle}
    class="selector-btn"
    type="button"
  >
    <span class="model-label">🤖 {displayLabel}</span>
    <span class="chevron">{open ? "▴" : "▾"}</span>
  </button>

  {#if open}
    <div class="dropdown">
      {#if session.availableModels.length === 0}
        <div class="dropdown-empty">No models available</div>
      {:else}
        {#each session.availableModels as model (`${model.provider}/${model.id}`)}
          <button
            onclick={() => selectModel(model)}
            class="dropdown-item"
            type="button"
          >
            <span class="model-name">{model.name}</span>
            <span class="model-provider">{model.provider}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

<style>
  .model-selector {
    position: relative;
  }

  .selector-btn {
    display: flex;
    align-items: center;
    gap: 0.4em;
    padding: 0.35em 0.75em;
    border-radius: 6px;
    border: 1px solid var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.8em;
    cursor: pointer;
    transition: background 0.15s;
    white-space: nowrap;
  }

  .selector-btn:hover {
    background: var(--color-border, #27272a);
  }

  .model-label {
    max-width: 180px;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .chevron {
    font-size: 0.8em;
    color: var(--color-text-secondary, #a1a1aa);
  }

  .dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    min-width: 240px;
    max-height: 300px;
    overflow-y: auto;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-secondary, #16213e);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    z-index: 100;
  }

  .dropdown-empty {
    padding: 1em;
    text-align: center;
    font-size: 0.85em;
    color: var(--color-text-secondary, #a1a1aa);
  }

  .dropdown-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    width: 100%;
    padding: 0.6em 0.75em;
    border: none;
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .dropdown-item:hover {
    background: var(--color-accent, #6366f1);
  }

  .model-name {
    font-weight: 500;
    font-size: 0.85em;
  }

  .model-provider {
    font-size: 0.75em;
    color: var(--color-text-secondary, #a1a1aa);
  }

  .dropdown-item:hover .model-provider {
    color: rgba(255, 255, 255, 0.7);
  }
</style>
