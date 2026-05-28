<script lang="ts">
  import { appSettings } from "../stores/settings.svelte.js";
  import type { ProviderConfig, CustomToolConfig } from "../ipc.js";

  let activeTab = $state<"providers" | "tools" | "appearance" | "advanced">("providers");

  // New provider form state
  let newProviderName = $state("");
  let newProviderUrl = $state("");
  let newProviderKey = $state("");
  let newProviderModels = $state("");
  let showKeyIndex = $state<number | null>(null);

  // New custom tool form state
  let newToolName = $state("");
  let newToolDescription = $state("");
  let newToolHandler = $state<"fetch" | "exec" | "log">("fetch");
  let newToolUrl = $state("");
  let newToolCommand = $state("");
  let newToolParams = $state("");
  let editingToolIndex = $state<number | null>(null);

  // System prompt
  let systemPromptText = $state(appSettings.systemPrompt ?? "");

  // Advanced form state
  let shellPath = $state(appSettings.settings.shell_path ?? "");
  let fontSize = $state(appSettings.settings.font_size);

  function handleAddProvider() {
    if (!newProviderName.trim() || !newProviderUrl.trim()) return;

    const provider: ProviderConfig = {
      name: newProviderName.trim(),
      api_url: newProviderUrl.trim(),
      api_key: newProviderKey.trim(),
      models: newProviderModels
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    };

    appSettings.addProvider(provider);
    newProviderName = "";
    newProviderUrl = "";
    newProviderKey = "";
    newProviderModels = "";
  }

  function handleRemoveProvider(index: number) {
    appSettings.removeProvider(index);
  }

  function handleToggleKeyVisibility(index: number) {
    showKeyIndex = showKeyIndex === index ? null : index;
  }

  function handleSaveAdvanced() {
    appSettings.setShellPath(shellPath.trim() || null);
    appSettings.setFontSize(fontSize);
  }

  function handleSetDefault(index: number) {
    const provider = appSettings.providers[index];
    appSettings.settings = {
      ...appSettings.settings,
      default_provider: provider.name,
    };
    appSettings.saveSettings();
  }

  function handleThemeChange(theme: string) {
    appSettings.setTheme(theme);
  }

  // ── Custom Tool handlers ─────────────────────────────

  function handleAddTool() {
    if (!newToolName.trim()) return;

    let parameters: Record<string, unknown> = {
      type: "object",
      properties: {} as Record<string, unknown>,
      required: [] as string[],
    };

    if (newToolParams.trim()) {
      try {
        // Parse simple "name:type" format
        const props: Record<string, unknown> = {};
        const required: string[] = [];
        for (const p of newToolParams.split(",").map((s) => s.trim()).filter(Boolean)) {
          const [name, type] = p.split(":").map((s) => s.trim());
          props[name] = { type: type || "string", description: `${name} parameter` };
          required.push(name);
        }
        parameters = { type: "object", properties: props, required };
      } catch {
        // Use default empty schema
      }
    }

    const tool: CustomToolConfig = {
      name: newToolName.trim(),
      description: newToolDescription.trim(),
      parameters,
      handler: newToolHandler,
      url: newToolHandler === "fetch" ? newToolUrl.trim() || undefined : undefined,
      command: newToolHandler === "exec" ? newToolCommand.trim() || undefined : undefined,
    };

    if (editingToolIndex !== null) {
      appSettings.updateCustomTool(editingToolIndex, tool);
      editingToolIndex = null;
    } else {
      appSettings.addCustomTool(tool);
    }

    newToolName = "";
    newToolDescription = "";
    newToolHandler = "fetch";
    newToolUrl = "";
    newToolCommand = "";
    newToolParams = "";
  }

  function handleEditTool(index: number) {
    const tool = appSettings.customTools[index];
    newToolName = tool.name;
    newToolDescription = tool.description;
    newToolHandler = tool.handler;
    newToolUrl = tool.url ?? "";
    newToolCommand = tool.command ?? "";
    const params = tool.parameters?.properties
      ? Object.entries(tool.parameters.properties as Record<string, any>)
          .map(([k, v]) => `${k}:${v.type || "string"}`)
          .join(", ")
      : "";
    newToolParams = params;
    editingToolIndex = index;
  }

  function handleRemoveTool(index: number) {
    appSettings.removeCustomTool(index);
    if (editingToolIndex === index) {
      editingToolIndex = null;
      newToolName = "";
      newToolDescription = "";
      newToolHandler = "fetch";
      newToolUrl = "";
      newToolCommand = "";
      newToolParams = "";
    }
  }

  function handleSaveSystemPrompt() {
    appSettings.setSystemPrompt(systemPromptText.trim() || null);
  }

  function handleCancelEditTool() {
    editingToolIndex = null;
    newToolName = "";
    newToolDescription = "";
    newToolHandler = "fetch";
    newToolUrl = "";
    newToolCommand = "";
    newToolParams = "";
  }
</script>

{#if appSettings.isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="modal-overlay" onclick={() => appSettings.closeSettingsPanel()} onkeydown={() => {}}>
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="modal-content" onclick={(e) => e.stopPropagation()} onkeydown={() => {}}>
      <div class="modal-header">
        <h2 class="modal-title">Settings</h2>
        <button class="close-btn" onclick={() => appSettings.closeSettingsPanel()}>
          ✕
        </button>
      </div>

      <!-- Tabs -->
      <div class="tabs">
        <button
          class="tab-btn"
          class:active={activeTab === "providers"}
          onclick={() => (activeTab = "providers")}
        >
          🔑 Providers
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === "tools"}
          onclick={() => (activeTab = "tools")}
        >
          🔧 Custom Tools
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === "appearance"}
          onclick={() => (activeTab = "appearance")}
        >
          🎨 Appearance
        </button>
        <button
          class="tab-btn"
          class:active={activeTab === "advanced"}
          onclick={() => (activeTab = "advanced")}
        >
          ⚙️ Advanced
        </button>
      </div>

      <div class="modal-body">
        {#if activeTab === "providers"}
          <!-- Existing providers -->
          <div class="section">
            <div class="section-label">Configured Providers</div>
            {#if appSettings.providers.length === 0}
              <div class="empty-state">No providers configured. Add one below.</div>
            {:else}
              <div class="provider-list">
                {#each appSettings.providers as provider, i (i)}
                  <div class="provider-card">
                    <div class="provider-header">
                      <span class="provider-name">{provider.name}</span>
                      {#if appSettings.settings.default_provider === provider.name}
                        <span class="default-badge">Default</span>
                      {:else}
                        <button
                          class="set-default-btn"
                          onclick={() => handleSetDefault(i)}
                        >
                          Set default
                        </button>
                      {/if}
                    </div>
                    <div class="provider-url">{provider.api_url}</div>
                    <div class="provider-meta">
                      <span class="provider-key">
                        {showKeyIndex === i ? provider.api_key : "••••••••••••••••"}
                      </span>
                      <button
                        class="toggle-key-btn"
                        onclick={() => handleToggleKeyVisibility(i)}
                      >
                        {showKeyIndex === i ? "Hide" : "Show"}
                      </button>
                    </div>
                    {#if provider.models.length > 0}
                      <div class="provider-models">
                        {#each provider.models as model}
                          <span class="model-tag">{model}</span>
                        {/each}
                      </div>
                    {/if}
                    <button
                      class="remove-btn"
                      onclick={() => handleRemoveProvider(i)}
                    >
                      🗑️ Remove
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Add new provider -->
          <div class="section">
            <div class="section-label">Add Provider</div>
            <div class="form-grid">
              <div class="form-field">
                <label class="form-label" for="provider-name">Name</label>
                <input
                  id="provider-name"
                  type="text"
                  bind:value={newProviderName}
                  placeholder="My Provider"
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="provider-url">API URL</label>
                <input
                  id="provider-url"
                  type="text"
                  bind:value={newProviderUrl}
                  placeholder="https://api.anthropic.com"
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="provider-key">API Key</label>
                <input
                  id="provider-key"
                  type="password"
                  bind:value={newProviderKey}
                  placeholder="sk-..."
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="provider-models">Models (comma separated)</label>
                <input
                  id="provider-models"
                  type="text"
                  bind:value={newProviderModels}
                  placeholder="claude-sonnet-4-20250514, claude-haiku-4-5-20250514"
                  class="form-input"
                />
              </div>
            </div>
            <button class="add-btn" onclick={handleAddProvider}>
              ＋ Add Provider
            </button>
          </div>

        {:else if activeTab === "tools"}
          <!-- System Prompt -->
          <div class="section">
            <div class="section-label">System Prompt Override</div>
            <p class="form-hint">Override the default agent system prompt for all sessions</p>
            <textarea
              class="form-textarea"
              bind:value={systemPromptText}
              placeholder="You are a helpful coding assistant..."
              rows="3"
            ></textarea>
            <button class="save-btn" onclick={handleSaveSystemPrompt}>
              Save System Prompt
            </button>
          </div>

          <!-- Existing custom tools -->
          <div class="section">
            <div class="section-label">Custom Tools</div>
            {#if appSettings.customTools.length === 0}
              <div class="empty-state">No custom tools. Add one below to extend the agent's capabilities.</div>
            {:else}
              <div class="provider-list">
                {#each appSettings.customTools as tool, i (i)}
                  <div class="provider-card">
                    <div class="provider-header">
                      <span class="provider-name">🔧 {tool.name}</span>
                      <span class="handler-badge">{tool.handler}</span>
                    </div>
                    <div class="tool-desc">{tool.description}</div>
                    {#if tool.url}
                      <div class="provider-url">{tool.url}</div>
                    {/if}
                    {#if tool.command}
                      <div class="provider-url">Command: {tool.command}</div>
                    {/if}
                    <div class="tool-actions">
                      <button class="edit-btn" onclick={() => handleEditTool(i)}>
                        ✏️ Edit
                      </button>
                      <button class="remove-btn" onclick={() => handleRemoveTool(i)}>
                        🗑️ Remove
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Add / Edit custom tool -->
          <div class="section">
            <div class="section-label">
              {editingToolIndex !== null ? "Edit Tool" : "Add Custom Tool"}
            </div>
            <div class="form-grid">
              <div class="form-field">
                <label class="form-label" for="tool-name">Tool Name</label>
                <input
                  id="tool-name"
                  type="text"
                  bind:value={newToolName}
                  placeholder="knowledge_search"
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="tool-desc">Description</label>
                <input
                  id="tool-desc"
                  type="text"
                  bind:value={newToolDescription}
                  placeholder="Search the knowledge base"
                  class="form-input"
                />
              </div>
              <div class="form-field">
                <label class="form-label" for="tool-handler">Handler</label>
                <select id="tool-handler" bind:value={newToolHandler} class="form-input">
                  <option value="fetch">Fetch URL</option>
                  <option value="exec">Run Command</option>
                  <option value="log">Log Only</option>
                </select>
              </div>
              <div class="form-field">
                <label class="form-label" for="tool-params">Parameters (name:type, ...)</label>
                <input
                  id="tool-params"
                  type="text"
                  bind:value={newToolParams}
                  placeholder="query:string, limit:number"
                  class="form-input"
                />
              </div>
            </div>

            {#if newToolHandler === "fetch"}
              <div class="form-field" style="margin-top: 0.5em;">
                <label class="form-label" for="tool-url">URL</label>
                <input
                  id="tool-url"
                  type="text"
                  bind:value={newToolUrl}
                  placeholder="https://api.example.com/search"
                  class="form-input full-width"
                />
              </div>
            {:else if newToolHandler === "exec"}
              <div class="form-field" style="margin-top: 0.5em;">
                <label class="form-label" for="tool-cmd">Command</label>
                <input
                  id="tool-cmd"
                  type="text"
                  bind:value={newToolCommand}
                  placeholder="curl https://api.example.com/search?q={query}"
                  class="form-input full-width"
                />
              </div>
            {/if}

            <div style="display: flex; gap: 0.5em; margin-top: 0.5em;">
              <button class="add-btn" onclick={handleAddTool}>
                {editingToolIndex !== null ? "✏️ Update Tool" : "＋ Add Tool"}
              </button>
              {#if editingToolIndex !== null}
                <button class="cancel-btn" onclick={handleCancelEditTool}>
                  Cancel
                </button>
              {/if}
            </div>
          </div>

        {:else if activeTab === "appearance"}
          <div class="section">
            <div class="section-label">Theme</div>
            <div class="theme-options">
              <button
                class="theme-btn"
                class:active={appSettings.currentTheme === "dark"}
                onclick={() => handleThemeChange("dark")}
              >
                🌙 Dark
              </button>
              <button
                class="theme-btn"
                class:active={appSettings.currentTheme === "light"}
                onclick={() => handleThemeChange("light")}
              >
                ☀️ Light
              </button>
            </div>
          </div>
        {:else if activeTab === "advanced"}
          <div class="section">
            <div class="section-label">Shell Path</div>
            <p class="form-hint">Override the default shell for running commands (e.g., Git Bash on Windows)</p>
            <input
              type="text"
              bind:value={shellPath}
              placeholder="C:\\Program Files\\Git\\bin\\bash.exe"
              class="form-input full-width"
            />
          </div>

          <div class="section">
            <div class="section-label">Font Size</div>
            <div class="font-size-control">
              <input
                type="range"
                bind:value={fontSize}
                min="10"
                max="24"
                step="1"
                class="font-slider"
              />
              <span class="font-size-value">{fontSize}px</span>
            </div>
          </div>

          <button class="save-btn" onclick={handleSaveAdvanced}>
            Save Advanced Settings
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.6);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--color-bg-secondary, #16213e);
    border: 1px solid var(--color-border, #27272a);
    border-radius: 16px;
    width: 600px;
    max-width: 90vw;
    max-height: 80vh;
    display: flex;
    flex-direction: column;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1em 1.5em;
    border-bottom: 1px solid var(--color-border, #27272a);
  }

  .modal-title {
    margin: 0;
    font-size: 1.1em;
    font-weight: 600;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: none;
    background: transparent;
    color: var(--color-text-secondary, #a1a1aa);
    cursor: pointer;
    font-size: 0.9em;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  /* ── Tabs ────────────────────────────── */

  .tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--color-border, #27272a);
    padding: 0 1.5em;
    overflow-x: auto;
  }

  .tab-btn {
    padding: 0.6em 0.8em;
    border: none;
    background: transparent;
    color: var(--color-text-secondary, #a1a1aa);
    font-size: 0.82em;
    cursor: pointer;
    border-bottom: 2px solid transparent;
    transition: all 0.15s;
    font-family: inherit;
    white-space: nowrap;
  }

  .tab-btn:hover {
    color: var(--color-text-primary, #e4e4e7);
  }

  .tab-btn.active {
    color: var(--color-accent, #6366f1);
    border-bottom-color: var(--color-accent, #6366f1);
  }

  /* ── Body ────────────────────────────── */

  .modal-body {
    flex: 1;
    overflow-y: auto;
    padding: 1em 1.5em;
  }

  .section {
    margin-bottom: 1.25em;
  }

  .section-label {
    font-size: 0.8em;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-secondary, #a1a1aa);
    margin-bottom: 0.6em;
  }

  .empty-state {
    font-size: 0.85em;
    color: var(--color-text-muted, #71717a);
    padding: 1em 0;
  }

  /* ── Provider Cards ──────────────────── */

  .provider-list {
    display: flex;
    flex-direction: column;
    gap: 0.5em;
    margin-bottom: 1em;
  }

  .provider-card {
    padding: 0.75em;
    border: 1px solid var(--color-border, #27272a);
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.02);
  }

  .provider-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 0.3em;
  }

  .provider-name {
    font-weight: 600;
    font-size: 0.9em;
  }

  .default-badge {
    font-size: 0.7em;
    padding: 0.15em 0.5em;
    border-radius: 10px;
    background: var(--color-accent, #6366f1);
    color: white;
  }

  .handler-badge {
    font-size: 0.65em;
    padding: 0.15em 0.5em;
    border-radius: 4px;
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .set-default-btn {
    font-size: 0.7em;
    padding: 0.15em 0.5em;
    border-radius: 4px;
    border: 1px solid var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-secondary, #a1a1aa);
    cursor: pointer;
    font-family: inherit;
  }

  .set-default-btn:hover {
    border-color: var(--color-accent, #6366f1);
    color: var(--color-accent, #6366f1);
  }

  .provider-url {
    font-size: 0.75em;
    color: var(--color-text-muted, #71717a);
    font-family: "JetBrains Mono", "Fira Code", monospace;
    margin-bottom: 0.3em;
  }

  .provider-meta {
    display: flex;
    align-items: center;
    gap: 0.5em;
    margin-bottom: 0.3em;
  }

  .provider-key {
    font-size: 0.75em;
    font-family: "JetBrains Mono", "Fira Code", monospace;
    color: var(--color-text-muted, #71717a);
  }

  .toggle-key-btn {
    font-size: 0.65em;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    border: 1px solid var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-secondary, #a1a1aa);
    cursor: pointer;
    font-family: inherit;
  }

  .provider-models {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3em;
    margin-bottom: 0.4em;
  }

  .model-tag {
    font-size: 0.7em;
    padding: 0.1em 0.4em;
    border-radius: 4px;
    background: rgba(99, 102, 241, 0.15);
    color: var(--color-accent, #6366f1);
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .remove-btn {
    font-size: 0.75em;
    padding: 0.2em 0.5em;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: #f87171;
    cursor: pointer;
    font-family: inherit;
  }

  .remove-btn:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  .edit-btn {
    font-size: 0.75em;
    padding: 0.2em 0.5em;
    border-radius: 4px;
    border: none;
    background: transparent;
    color: var(--color-accent, #6366f1);
    cursor: pointer;
    font-family: inherit;
  }

  .edit-btn:hover {
    background: rgba(99, 102, 241, 0.1);
  }

  .tool-desc {
    font-size: 0.8em;
    color: var(--color-text-secondary, #a1a1aa);
    margin-bottom: 0.3em;
  }

  .tool-actions {
    display: flex;
    gap: 0.5em;
  }

  /* ── Form ────────────────────────────── */

  .form-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5em;
  }

  .form-field {
    display: flex;
    flex-direction: column;
    gap: 0.25em;
  }

  .form-label {
    font-size: 0.75em;
    font-weight: 500;
    color: var(--color-text-secondary, #a1a1aa);
  }

  .form-input,
  .form-textarea {
    padding: 0.5em 0.65em;
    border-radius: 6px;
    border: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-primary, #1a1a2e);
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.85em;
    outline: none;
    font-family: inherit;
  }

  .form-input:focus,
  .form-textarea:focus {
    border-color: var(--color-accent, #6366f1);
  }

  .form-textarea {
    width: 100%;
    resize: vertical;
    min-height: 3em;
  }

  .full-width {
    width: 100%;
    margin-top: 0.25em;
  }

  .form-hint {
    font-size: 0.75em;
    color: var(--color-text-muted, #71717a);
    margin: 0 0 0.25em;
  }

  .add-btn,
  .save-btn,
  .cancel-btn {
    margin-top: 0.5em;
    padding: 0.5em 1em;
    border-radius: 8px;
    border: none;
    font-size: 0.85em;
    cursor: pointer;
    font-family: inherit;
    transition: background 0.15s;
  }

  .add-btn,
  .save-btn {
    background: var(--color-accent, #6366f1);
    color: white;
  }

  .add-btn:hover,
  .save-btn:hover {
    background: var(--color-accent-hover, #818cf8);
  }

  .cancel-btn {
    background: transparent;
    border: 1px solid var(--color-border, #27272a);
    color: var(--color-text-secondary, #a1a1aa);
  }

  .cancel-btn:hover {
    border-color: var(--color-text-secondary, #a1a1aa);
  }

  /* ── Theme ───────────────────────────── */

  .theme-options {
    display: flex;
    gap: 0.75em;
  }

  .theme-btn {
    display: flex;
    align-items: center;
    gap: 0.5em;
    padding: 0.75em 1.25em;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.9em;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .theme-btn:hover {
    border-color: var(--color-accent, #6366f1);
  }

  .theme-btn.active {
    border-color: var(--color-accent, #6366f1);
    background: rgba(99, 102, 241, 0.1);
  }

  /* ── Font Size ───────────────────────── */

  .font-size-control {
    display: flex;
    align-items: center;
    gap: 1em;
  }

  .font-slider {
    flex: 1;
  }

  .font-size-value {
    font-size: 0.85em;
    color: var(--color-text-secondary, #a1a1aa);
    min-width: 3em;
    text-align: right;
  }
</style>
