// Bridge configuration — default models, custom tools, system prompt

export interface CustomToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for parameters */
  parameters: Record<string, unknown>;
  /** How to execute the tool */
  handler: "fetch" | "exec" | "log";
  /** URL template for fetch-type tools — use {param} for substitution */
  url?: string;
  /** Command template for exec-type tools */
  command?: string;
}

export interface BridgeConfig {
  /** Default provider name (e.g., "anthropic", "openai") */
  defaultProvider: string;
  /** Default model id */
  defaultModel: string;
  /** API key for the default provider */
  _apiKey?: string;
  /** API URL for the default provider */
  _apiUrl?: string;
  /** System prompt override */
  systemPrompt?: string;
  /** Custom tools to register with the agent */
  customTools: CustomToolDefinition[];
}

export const DEFAULT_CONFIG: BridgeConfig = {
  defaultProvider: "",
  defaultModel: "",
  _apiKey: undefined,
  _apiUrl: undefined,
  systemPrompt: undefined,
  customTools: [],
};

let currentConfig: BridgeConfig = { ...DEFAULT_CONFIG };

export function getConfig(): BridgeConfig {
  return { ...currentConfig };
}

export function setConfig(config: Partial<BridgeConfig>): BridgeConfig {
  currentConfig = {
    ...currentConfig,
    ...config,
    customTools: config.customTools ?? currentConfig.customTools,
  };
  return getConfig();
}

export function resetConfig(): BridgeConfig {
  currentConfig = { ...DEFAULT_CONFIG };
  return getConfig();
}
