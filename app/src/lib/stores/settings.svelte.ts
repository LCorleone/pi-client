// Settings store — manages app configuration, providers, themes, custom tools

import {
  getSettings,
  saveSettings as saveSettingsIpc,
  updateBridgeConfig,
  type AppSettings,
  type ProviderConfig,
  type CustomToolConfig,
} from "../ipc.js";

// ── State ──────────────────────────────────────────────────────────

let settings = $state<AppSettings>(defaultSettings());
let isLoaded = $state(false);
let isOpen = $state(false);

function defaultSettings(): AppSettings {
  return {
    theme: "dark",
    providers: [],
    default_provider: "",
    shell_path: null,
    font_size: 14,
    custom_tools: [],
    system_prompt: null,
    setup_completed: false,
  };
}

// ── Derived ────────────────────────────────────────────────────────

let currentTheme = $derived(settings.theme);
let providers = $derived(settings.providers);
let fontSize = $derived(settings.font_size);
let customTools = $derived(settings.custom_tools);
let systemPrompt = $derived(settings.system_prompt);
let setupCompleted = $derived(settings.setup_completed);

// ── Actions ────────────────────────────────────────────────────────

let fontSizeSaveTimer: ReturnType<typeof setTimeout>;

async function loadSettings(): Promise<void> {
  try {
    settings = await getSettings();
    isLoaded = true;

    // Apply theme on load
    applyTheme(settings.theme);

    // Push config to bridge (provider, model, tools, system prompt)
    if (settings.setup_completed) {
      pushConfigToBridge();
    }
  } catch (err) {
    console.error("[Settings] Failed to load:", err);
    settings = defaultSettings();
    isLoaded = true;
  }
}

async function saveSettings(): Promise<void> {
  try {
    await saveSettingsIpc(settings);
  } catch (err) {
    console.error("[Settings] Failed to save:", err);
  }
}

function addProvider(provider: ProviderConfig): void {
  settings = {
    ...settings,
    providers: [...settings.providers, provider],
  };
  saveSettings();
}

function removeProvider(index: number): void {
  settings = {
    ...settings,
    providers: settings.providers.filter((_, i) => i !== index),
  };
  saveSettings();
}

function updateProvider(index: number, updates: Partial<ProviderConfig>): void {
  settings = {
    ...settings,
    providers: settings.providers.map((p, i) =>
      i === index ? { ...p, ...updates } : p
    ),
  };
  saveSettings();
}

function setTheme(theme: string): void {
  settings = { ...settings, theme };
  applyTheme(theme);
  saveSettings();
}

function setFontSize(size: number): void {
  settings = { ...settings, font_size: size };
  // Debounced save — don't write on every drag pixel
  clearTimeout(fontSizeSaveTimer);
  fontSizeSaveTimer = setTimeout(() => saveSettings(), 500);
}

function setShellPath(path: string | null): void {
  settings = { ...settings, shell_path: path };
  saveSettings();
}

function toggleTheme(): void {
  setTheme(settings.theme === "dark" ? "light" : "dark");
}

function openSettingsPanel(): void {
  isOpen = true;
}

function closeSettingsPanel(): void {
  isOpen = false;
}

// ── Custom Tools ───────────────────────────────────────────────────

function addCustomTool(tool: CustomToolConfig): void {
  settings = {
    ...settings,
    custom_tools: [...settings.custom_tools, tool],
  };
  saveSettings();
  pushConfigToBridge();
}

function removeCustomTool(index: number): void {
  settings = {
    ...settings,
    custom_tools: settings.custom_tools.filter((_, i) => i !== index),
  };
  saveSettings();
  pushConfigToBridge();
}

function updateCustomTool(index: number, updates: Partial<CustomToolConfig>): void {
  settings = {
    ...settings,
    custom_tools: settings.custom_tools.map((t, i) =>
      i === index ? { ...t, ...updates } : t
    ),
  };
  saveSettings();
  pushConfigToBridge();
}

function setSystemPrompt(prompt: string | null): void {
  settings = { ...settings, system_prompt: prompt };
  saveSettings();
  pushConfigToBridge();
}

function setSetupCompleted(completed: boolean): void {
  settings = { ...settings, setup_completed: completed };
  saveSettings();
}

/** Push custom tools and system prompt to the bridge */
function pushConfigToBridge(): void {
  try {
    const provider = settings.providers.find((p) => p.name === settings.default_provider);
    updateBridgeConfig({
      defaultProvider: settings.default_provider,
      defaultModel: provider?.models?.[0] ?? "",
      models: provider?.models ?? [],
      _apiKey: provider?.api_key,
      _apiUrl: provider?.api_url,
      systemPrompt: settings.system_prompt || undefined,
      customTools: settings.custom_tools.map((t) => ({
        name: t.name,
        description: t.description,
        parameters: t.parameters,
        handler: t.handler,
        url: t.url,
        command: t.command,
      })),
    });
  } catch (err) {
    console.error("[Settings] Failed to push config to bridge:", err);
  }
}

function applyTheme(theme: string): void {
  if (typeof document !== "undefined") {
    const root = document.documentElement;
    if (theme === "light") {
      root.classList.add("light");
    } else {
      root.classList.remove("light");
    }
  }
}

// ── Export ─────────────────────────────────────────────────────────

class SettingsStore {
  get settings() {
    return settings;
  }
  set settings(value: AppSettings) {
    settings = value;
  }
  get isLoaded() {
    return isLoaded;
  }
  get isOpen() {
    return isOpen;
  }
  get currentTheme() {
    return currentTheme;
  }
  get providers() {
    return providers;
  }
  get fontSize() {
    return fontSize;
  }
  get customTools() {
    return customTools;
  }
  get systemPrompt() {
    return systemPrompt;
  }
  get setupCompleted() {
    return setupCompleted;
  }

  loadSettings = loadSettings;
  saveSettings = saveSettings;
  addProvider = addProvider;
  removeProvider = removeProvider;
  updateProvider = updateProvider;
  setTheme = setTheme;
  setFontSize = setFontSize;
  setShellPath = setShellPath;
  toggleTheme = toggleTheme;
  openSettingsPanel = openSettingsPanel;
  closeSettingsPanel = closeSettingsPanel;
  applyTheme = applyTheme;
  addCustomTool = addCustomTool;
  removeCustomTool = removeCustomTool;
  updateCustomTool = updateCustomTool;
  setSystemPrompt = setSystemPrompt;
  setSetupCompleted = setSetupCompleted;
  pushConfigToBridge = pushConfigToBridge;
}

export const appSettings = new SettingsStore();
