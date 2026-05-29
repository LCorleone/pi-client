<script lang="ts">
  import { appSettings } from "../stores/settings.svelte.js";
  import type { ProviderConfig } from "../ipc.js";

  let step = $state(0); // 0=welcome, 1=api, 2=shell, 3=folder, 4=done

  // Provider presets
  const presets = [
    { name: "Anthropic", url: "https://api.anthropic.com", models: "claude-sonnet-4-20250514" },
    { name: "OpenAI", url: "https://api.openai.com/v1", models: "gpt-4o" },
    { name: "Custom", url: "", models: "" },
  ];
  let selectedPreset = $state(0);

  // API config state
  let apiUrl = $state("https://api.anthropic.com");
  let apiKey = $state("");
  let modelName = $state("claude-sonnet-4-20250514");
  let showApiKey = $state(false);
  let testingConnection = $state(false);
  let connectionTestResult = $state<"success" | "error" | null>(null);

  // Shell state
  let detectedShell = $state("");
  let shellPath = $state("");
  let shellDetectionAttempted = $state(false);

  // Folder state
  let cwd = $state("");

  function selectPreset(index: number) {
    selectedPreset = index;
    const preset = presets[index];
    if (preset) {
      apiUrl = preset.url;
      modelName = preset.models;
    }
  }

  async function testConnection() {
    if (!apiUrl || !apiKey) return;
    testingConnection = true;
    connectionTestResult = null;

    try {
      // Use Tauri HTTP if available, otherwise skip test
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke("test_api_connection", { apiUrl, apiKey });
      connectionTestResult = result ? "success" : "error";
    } catch {
      // Can't test outside Tauri (dev mode) — show nothing
      connectionTestResult = null;
    } finally {
      testingConnection = false;
    }
  }

  function detectGitBash() {
    // Common Git Bash paths on Windows — in Tauri, this would be checked by the Rust backend
    // For now, show the common paths as hints
    const commonPaths = [
      "C:\\Program Files\\Git\\bin\\bash.exe",
      "C:\\Program Files (x86)\\Git\\bin\\bash.exe",
      "C:\\Users\\Default\\AppData\\Local\\Programs\\Git\\bin\\bash.exe",
    ];
    detectedShell = commonPaths[0];
    shellDetectionAttempted = true;
  }

  function nextStep() {
    if (step < 4) step++;
    if (step === 2) detectGitBash();
  }

  function prevStep() {
    if (step > 0) step--;
  }

  async function finish() {
    // Save the provider config
    const provider: ProviderConfig = {
      name: presets[selectedPreset]?.name || "Custom",
      api_url: apiUrl,
      api_key: apiKey,
      models: modelName.split(",").map((m) => m.trim()).filter(Boolean),
    };

    appSettings.addProvider(provider);
    appSettings.settings = {
      ...appSettings.settings,
      default_provider: provider.name,
      shell_path: shellPath.trim() || null,
    };
    await appSettings.saveSettings();
    appSettings.setSetupCompleted(true);

    // Dispatch event so +page.svelte knows setup is done
    // Include cwd if user selected one
    window.dispatchEvent(new CustomEvent("setup-complete", { detail: { cwd } }));

    step = 4;
  }

  async function pickFolder() {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const dir = await invoke<string | null>("pick_directory");
      if (dir) {
        cwd = dir;
      }
    } catch {
      // Not in Tauri — manual entry
      cwd = prompt("Enter project folder path:") ?? "";
    }
  }

  function canProceed(): boolean {
    switch (step) {
      case 0: return true;
      case 1: return apiUrl.trim().length > 0 && apiKey.trim().length > 0 && modelName.trim().length > 0;
      case 2: return true; // Shell is optional
      case 3: return cwd.trim().length > 0;
      case 4: return true;
      default: return false;
    }
  }
</script>

<div class="setup-wizard">
  <div class="wizard-card">
    <!-- Progress bar -->
    <div class="progress-bar">
      {#each [0, 1, 2, 3] as i}
        <div class="progress-dot" class:active={step >= i} class:current={step === i}></div>
        {#if i < 3}
          <div class="progress-line" class:active={step > i}></div>
        {/if}
      {/each}
    </div>

    <!-- Step 0: Welcome -->
    {#if step === 0}
      <div class="wizard-step">
        <div class="wizard-logo">🤖</div>
        <h1 class="wizard-title">Welcome to Pi Desktop</h1>
        <p class="wizard-subtitle">Your AI-powered coding assistant</p>
        <p class="wizard-desc">
          Let's set up your environment in a few quick steps.
          You'll need an API key from your AI provider.
        </p>
        <div class="wizard-features">
          <div class="feature">💬 AI Chat with streaming responses</div>
          <div class="feature">🔧 Tool execution & file editing</div>
          <div class="feature">📁 Session management & persistence</div>
          <div class="feature">🎨 Customizable themes & settings</div>
        </div>
      </div>

    <!-- Step 1: API Configuration -->
    {:else if step === 1}
      <div class="wizard-step">
        <h2 class="step-title">🔑 API Configuration</h2>
        <p class="step-desc">Connect to your AI provider</p>

        <!-- Preset buttons -->
        <div class="preset-row">
          {#each presets as preset, i}
            <button
              class="preset-btn"
              class:active={selectedPreset === i}
              onclick={() => selectPreset(i)}
            >
              {preset.name}
            </button>
          {/each}
        </div>

        <div class="form-field">
          <label class="form-label" for="api-url">API URL</label>
          <input
            id="api-url"
            type="text"
            bind:value={apiUrl}
            placeholder="https://api.anthropic.com"
            class="form-input"
          />
        </div>

        <div class="form-field">
          <label class="form-label" for="api-key">API Key</label>
          <div class="input-row">
            <input
              id="api-key"
              type={showApiKey ? "text" : "password"}
              bind:value={apiKey}
              placeholder="sk-..."
              class="form-input"
            />
            <button class="toggle-btn" onclick={() => (showApiKey = !showApiKey)}>
              {showApiKey ? "🙈" : "👁️"}
            </button>
          </div>
        </div>

        <div class="form-field">
          <label class="form-label" for="model-name">Model Name</label>
          <input
            id="model-name"
            type="text"
            bind:value={modelName}
            placeholder="claude-sonnet-4-20250514"
            class="form-input"
          />
        </div>

        <div class="test-row">
          <button
            class="test-btn"
            onclick={testConnection}
            disabled={!apiUrl || !apiKey || testingConnection}
          >
            {testingConnection ? "⏳ Testing..." : "🔌 Test Connection"}
          </button>
          {#if connectionTestResult === "success"}
            <span class="test-result success">✅ Reachable</span>
          {:else if connectionTestResult === "error"}
            <span class="test-result error">❌ Cannot reach server</span>
          {/if}
        </div>
      </div>

    <!-- Step 2: Shell -->
    {:else if step === 2}
      <div class="wizard-step">
        <h2 class="step-title">🖥️ Shell Configuration</h2>
        <p class="step-desc">Pi needs a bash-compatible shell to run commands</p>

        {#if detectedShell}
          <div class="detected-box">
            <span class="detected-label">Detected Git Bash:</span>
            <code class="detected-path">{detectedShell}</code>
          </div>
        {:else}
          <div class="detected-box warning">
            <span class="detected-label">⚠️ Git Bash not detected</span>
            <p class="detected-hint">Please install Git for Windows from <a href="https://git-scm.com" target="_blank" rel="noopener">git-scm.com</a></p>
          </div>
        {/if}

        <div class="form-field" style="margin-top: 1em;">
          <label class="form-label" for="shell-path">Shell Path (leave empty for default)</label>
          <input
            id="shell-path"
            type="text"
            bind:value={shellPath}
            placeholder={detectedShell || "C:\\Program Files\\Git\\bin\\bash.exe"}
            class="form-input"
          />
        </div>

        <p class="step-note">You can change this later in Settings → Advanced</p>
      </div>

    <!-- Step 3: Working Directory -->
    {:else if step === 3}
      <div class="wizard-step">
        <h2 class="step-title">📁 Project Folder</h2>
        <p class="step-desc">Select the folder where your code lives</p>

        <button class="folder-btn" onclick={pickFolder}>
          <span>📂</span> Browse for Folder
        </button>

        {#if cwd}
          <div class="selected-folder">
            <code>{cwd}</code>
          </div>
        {/if}

        <p class="step-note">You can always open a different folder later</p>
      </div>

    <!-- Step 4: Done -->
    {:else if step === 4}
      <div class="wizard-step">
        <div class="wizard-logo">🎉</div>
        <h2 class="step-title">All Set!</h2>
        <p class="step-desc">Pi Desktop is ready to use</p>

        <div class="summary">
          <div class="summary-row">
            <span class="summary-label">Provider:</span>
            <span class="summary-value">{presets[selectedPreset]?.name || "Custom"}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Model:</span>
            <span class="summary-value">{modelName}</span>
          </div>
          <div class="summary-row">
            <span class="summary-label">Folder:</span>
            <span class="summary-value">{cwd || "Not selected"}</span>
          </div>
        </div>
      </div>
    {/if}

    <!-- Navigation -->
    <div class="wizard-nav">
      {#if step > 0 && step < 4}
        <button class="nav-btn secondary" onclick={prevStep}>
          ← Back
        </button>
      {:else}
        <div></div>
      {/if}

      {#if step < 3}
        <button
          class="nav-btn primary"
          onclick={nextStep}
          disabled={!canProceed()}
        >
          Next →
        </button>
      {:else if step === 3}
        <button
          class="nav-btn primary"
          onclick={finish}
          disabled={!canProceed()}
        >
          ✅ Finish Setup
        </button>
      {/if}
    </div>
  </div>
</div>

<style>
  .setup-wizard {
    display: flex;
    align-items: center;
    justify-content: center;
    flex: 1;
    min-height: 100vh;
    background: var(--color-bg-primary);
  }

  .wizard-card {
    background: var(--color-bg-secondary, #16213e);
    border: 1px solid var(--color-border, #27272a);
    border-radius: 20px;
    padding: 2em 2.5em;
    width: 520px;
    max-width: 90vw;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
  }

  /* ── Progress Bar ──────────────────── */

  .progress-bar {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0;
    margin-bottom: 2em;
  }

  .progress-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--color-border, #27272a);
    transition: all 0.3s;
  }

  .progress-dot.active {
    background: var(--color-accent, #6366f1);
  }

  .progress-dot.current {
    width: 14px;
    height: 14px;
    box-shadow: 0 0 8px var(--color-accent, #6366f1);
  }

  .progress-line {
    width: 40px;
    height: 2px;
    background: var(--color-border, #27272a);
    transition: background 0.3s;
  }

  .progress-line.active {
    background: var(--color-accent, #6366f1);
  }

  /* ── Steps ─────────────────────────── */

  .wizard-step {
    min-height: 200px;
  }

  .wizard-logo {
    font-size: 3.5em;
    text-align: center;
    margin-bottom: 0.5em;
  }

  .wizard-title {
    text-align: center;
    font-size: 1.6em;
    font-weight: 700;
    color: var(--color-accent, #6366f1);
    margin: 0 0 0.25em;
  }

  .wizard-subtitle {
    text-align: center;
    font-size: 1.05em;
    color: var(--color-text-secondary, #a1a1aa);
    margin: 0 0 1em;
  }

  .wizard-desc {
    text-align: center;
    font-size: 0.85em;
    color: var(--color-text-muted, #71717a);
    margin: 0 0 1.5em;
    line-height: 1.5;
  }

  .wizard-features {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6em;
    margin-top: 1em;
  }

  .feature {
    font-size: 0.82em;
    color: var(--color-text-secondary, #a1a1aa);
    padding: 0.5em 0.75em;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, #27272a);
    text-align: center;
  }

  .step-title {
    font-size: 1.2em;
    font-weight: 600;
    margin: 0 0 0.25em;
  }

  .step-desc {
    font-size: 0.85em;
    color: var(--color-text-secondary, #a1a1aa);
    margin: 0 0 1.25em;
  }

  .step-note {
    font-size: 0.75em;
    color: var(--color-text-muted, #71717a);
    margin-top: 1em;
  }

  /* ── Presets ───────────────────────── */

  .preset-row {
    display: flex;
    gap: 0.5em;
    margin-bottom: 1em;
  }

  .preset-btn {
    flex: 1;
    padding: 0.5em;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.85em;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }

  .preset-btn:hover {
    border-color: var(--color-accent, #6366f1);
  }

  .preset-btn.active {
    border-color: var(--color-accent, #6366f1);
    background: rgba(99, 102, 241, 0.1);
    color: var(--color-accent, #6366f1);
  }

  /* ── Forms ─────────────────────────── */

  .form-field {
    margin-bottom: 0.75em;
  }

  .form-label {
    display: block;
    font-size: 0.75em;
    font-weight: 500;
    color: var(--color-text-secondary, #a1a1aa);
    margin-bottom: 0.25em;
  }

  .form-input {
    width: 100%;
    padding: 0.55em 0.65em;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
    background: var(--color-bg-primary, #1a1a2e);
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.85em;
    outline: none;
    font-family: inherit;
    box-sizing: border-box;
  }

  .form-input:focus {
    border-color: var(--color-accent, #6366f1);
  }

  .input-row {
    display: flex;
    gap: 0.4em;
  }

  .input-row .form-input {
    flex: 1;
  }

  .toggle-btn {
    padding: 0 0.6em;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
    background: transparent;
    cursor: pointer;
    font-size: 0.9em;
  }

  /* ── Test Connection ───────────────── */

  .test-row {
    display: flex;
    align-items: center;
    gap: 0.75em;
    margin-top: 0.5em;
  }

  .test-btn {
    padding: 0.45em 1em;
    border-radius: 8px;
    border: 1px solid var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.8em;
    cursor: pointer;
    font-family: inherit;
  }

  .test-btn:hover:not(:disabled) {
    border-color: var(--color-accent, #6366f1);
  }

  .test-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .test-result {
    font-size: 0.8em;
  }

  .test-result.success {
    color: #4ade80;
  }

  .test-result.error {
    color: #f87171;
  }

  /* ── Detected Shell ────────────────── */

  .detected-box {
    padding: 0.75em 1em;
    border-radius: 8px;
    background: rgba(74, 222, 128, 0.08);
    border: 1px solid rgba(74, 222, 128, 0.2);
  }

  .detected-box.warning {
    background: rgba(251, 191, 36, 0.08);
    border-color: rgba(251, 191, 36, 0.2);
  }

  .detected-label {
    font-size: 0.8em;
    font-weight: 600;
    display: block;
    margin-bottom: 0.25em;
  }

  .detected-path {
    font-size: 0.75em;
    color: var(--color-text-muted, #71717a);
    font-family: "JetBrains Mono", "Fira Code", monospace;
  }

  .detected-hint {
    font-size: 0.75em;
    color: var(--color-text-muted, #71717a);
    margin: 0.25em 0 0;
  }

  .detected-hint a {
    color: var(--color-accent, #6366f1);
  }

  /* ── Folder ────────────────────────── */

  .folder-btn {
    display: flex;
    align-items: center;
    gap: 0.5em;
    width: 100%;
    padding: 0.75em 1em;
    border-radius: 12px;
    border: 2px dashed var(--color-border, #27272a);
    background: transparent;
    color: var(--color-text-primary, #e4e4e7);
    font-size: 0.95em;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
    justify-content: center;
  }

  .folder-btn:hover {
    border-color: var(--color-accent, #6366f1);
    background: rgba(99, 102, 241, 0.05);
  }

  .selected-folder {
    margin-top: 0.75em;
    padding: 0.5em 0.75em;
    border-radius: 8px;
    background: var(--color-bg-primary, #1a1a2e);
    border: 1px solid var(--color-border, #27272a);
  }

  .selected-folder code {
    font-size: 0.8em;
    color: var(--color-accent, #6366f1);
    word-break: break-all;
  }

  /* ── Summary ───────────────────────── */

  .summary {
    margin-top: 1em;
    display: flex;
    flex-direction: column;
    gap: 0.5em;
  }

  .summary-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5em 0.75em;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.03);
    border: 1px solid var(--color-border, #27272a);
  }

  .summary-label {
    font-size: 0.8em;
    color: var(--color-text-secondary, #a1a1aa);
  }

  .summary-value {
    font-size: 0.8em;
    font-weight: 500;
    color: var(--color-text-primary, #e4e4e7);
  }

  /* ── Navigation ────────────────────── */

  .wizard-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 1.5em;
    padding-top: 1em;
    border-top: 1px solid var(--color-border, #27272a);
  }

  .nav-btn {
    padding: 0.6em 1.5em;
    border-radius: 10px;
    font-size: 0.9em;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s;
    border: none;
  }

  .nav-btn.primary {
    background: var(--color-accent, #6366f1);
    color: white;
  }

  .nav-btn.primary:hover:not(:disabled) {
    background: var(--color-accent-hover, #818cf8);
  }

  .nav-btn.primary:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .nav-btn.secondary {
    background: transparent;
    color: var(--color-text-secondary, #a1a1aa);
    border: 1px solid var(--color-border, #27272a);
  }

  .nav-btn.secondary:hover {
    border-color: var(--color-text-secondary, #a1a1aa);
  }
</style>
