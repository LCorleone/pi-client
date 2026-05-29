// Pi SDK wrapper — manages a single AgentSession

import {
  createAgentSession,
  AuthStorage,
  ModelRegistry,
  DefaultResourceLoader,
  defineTool,
  type AgentSession,
  type AgentSessionEvent,
} from "@earendil-works/pi-coding-agent";
import type { SettingsManager } from "@earendil-works/pi-coding-agent";
import { writeEvent, type BridgeEvent } from "./protocol.js";
import { getConfig, type CustomToolDefinition } from "./config.js";

export interface AgentHandle {
  session: AgentSession;
  authStorage: AuthStorage;
  modelRegistry: ModelRegistry;
}

let currentHandle: AgentHandle | null = null;
let currentCwd: string | null = null;
let eventListenerUnsub: (() => void) | null = null;

export function getHandle(): AgentHandle | null {
  return currentHandle;
}

export function getCwd(): string | null {
  return currentCwd;
}

export function isStreaming(): boolean {
  return currentHandle?.session.isStreaming ?? false;
}

// ── Internal helpers ───────────────────────────────────────────────

/** Shell-escape a string to prevent injection */
function shellEscape(s: string): string {
  // Safe POSIX shell escaping: use $'...' syntax with hex-escaped special chars
  const escaped = s.replace(/[\\\n\r\x00-\x1f"'\$]/g, (ch) => {
    return "\\x" + ch.charCodeAt(0).toString(16).padStart(2, "0");
  });
  return "$'" + escaped + "'";
}

/** Build custom tools from config definitions */
function buildCustomTools(configTools: CustomToolDefinition[]) {
  return configTools.map((def) =>
    defineTool({
      name: def.name,
      label: def.name,
      description: def.description,
      parameters: def.parameters as any,
      execute: async (_toolCallId: string, params: Record<string, unknown>) => {
        try {
          if (def.handler === "fetch" && def.url) {
            // Substitute {param} placeholders in URL
            let url = def.url;
            for (const [key, val] of Object.entries(params)) {
              url = url.replace(`{${key}}`, String(val));
            }
            const response = await fetch(url, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(params),
            });
            const text = await response.text();
            return {
              content: [{ type: "text" as const, text }],
              details: {},
            };
          } else if (def.handler === "exec" && def.command) {
            // Execute command template with shell-escaped parameters (async)
            const { exec: execAsync } = await import("node:child_process");
            let cmd = def.command;
            for (const [key, val] of Object.entries(params)) {
              cmd = cmd.replace(`{${key}}`, shellEscape(String(val)));
            }
            const output = await new Promise<string>((resolve, reject) => {
              execAsync(cmd, { timeout: 30000 }, (err, stdout) => {
                if (err) reject(err);
                else resolve(stdout.toString());
              });
            });
            return {
              content: [{ type: "text" as const, text: output || "(no output)" }],
              details: {},
            };
          } else {
            // log handler — just return the params as text
            return {
              content: [{ type: "text" as const, text: JSON.stringify(params, null, 2) }],
              details: {},
            };
          }
        } catch (err: any) {
          return {
            content: [{ type: "text" as const, text: `Error: ${err?.message ?? String(err)}` }],
            details: {},
          };
        }
      },
    })
  );
}

/** Create a new agent session for the given working directory
 *  If sessionId is provided, attempt to resume an existing session */
export async function initSession(cwd: string, sessionId?: string): Promise<AgentHandle> {
  // Tear down existing session if any
  await destroySession();

  const config = getConfig();
  const authStorage = AuthStorage.create();
  const modelRegistry = ModelRegistry.create(authStorage);

  // Build options from config
  const sessionOptions: Record<string, any> = {
    cwd,
    authStorage,
    modelRegistry,
  };

  // Apply system prompt override if set
  if (config.systemPrompt) {
    const loader = new DefaultResourceLoader({
      cwd,
      systemPromptOverride: () => config.systemPrompt!,
    });
    await loader.reload();
    sessionOptions.resourceLoader = loader;
  }

  // Build custom tools from config
  if (config.customTools && config.customTools.length > 0) {
    const customTools = buildCustomTools(config.customTools);
    sessionOptions.customTools = customTools;
    // Include custom tool names in the tools list
    const baseTools = ["read", "bash", "edit", "write"];
    const customNames = config.customTools.map((t) => t.name);
    sessionOptions.tools = [...baseTools, ...customNames];
  }

  // Try to resolve default model from config
  if (config.defaultProvider && config.defaultModel) {
    const model = modelRegistry.find(config.defaultProvider, config.defaultModel);
    if (model) {
      sessionOptions.model = model;
    }
  }

  const { session } = await createAgentSession(sessionOptions);

  const handle: AgentHandle = {
    session,
    authStorage,
    modelRegistry,
  };

  // Subscribe to all agent events and forward them as bridge events
  const unsub = session.subscribe((event: AgentSessionEvent) => {
    forwardAgentEvent(event);
    // Also emit state changes on key events
    emitStateChanged(handle);
  });

  eventListenerUnsub = unsub;
  currentHandle = handle;
  currentCwd = cwd;

  return handle;
}

/** Destroy the current session */
export async function destroySession(): Promise<void> {
  if (eventListenerUnsub) {
    eventListenerUnsub();
    eventListenerUnsub = null;
  }
  if (currentHandle) {
    currentHandle.session.dispose();
    currentHandle = null;
    currentCwd = null;
  }
}

/** Send a prompt to the current session */
export async function sendPrompt(message: string, images?: Array<{ dataUrl: string; name: string }>): Promise<void> {
  if (!currentHandle) throw new Error("No active session. Send 'init' first.");

  if (images && images.length > 0) {
    // Parse images into SDK format: { type: "image", source: { type: "base64", mediaType, data } }
    const sdkImages = images
      .map((img) => {
        const match = img.dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        return match
          ? { type: "image" as const, source: { type: "base64" as const, mediaType: match[1], data: match[2] } }
          : null;
      })
      .filter(Boolean) as Array<{ type: "image"; source: { type: "base64"; mediaType: string; data: string } }>;
    await currentHandle.session.prompt(message, { images: sdkImages });
  } else {
    await currentHandle.session.prompt(message);
  }
}

/** Queue a steering message */
export async function sendSteer(message: string): Promise<void> {
  if (!currentHandle) throw new Error("No active session.");
  await currentHandle.session.steer(message);
}

/** Queue a follow-up message */
export async function sendFollowUp(message: string): Promise<void> {
  if (!currentHandle) throw new Error("No active session.");
  await currentHandle.session.followUp(message);
}

/** Abort current operation */
export async function sendAbort(): Promise<void> {
  if (!currentHandle) throw new Error("No active session.");
  await currentHandle.session.abort();
}

/** Set the model */
export async function setModel(provider: string, modelId: string): Promise<void> {
  if (!currentHandle) throw new Error("No active session.");

  const model = currentHandle.modelRegistry.find(provider, modelId);
  if (!model) {
    throw new Error(`Model not found: ${provider}/${modelId}`);
  }
  await currentHandle.session.setModel(model);
}

/** Get all models */
export function getModels(): { provider: string; id: string; name: string }[] {
  if (!currentHandle) return [];

  const models = currentHandle.modelRegistry.getAll();
  return models.map((m) => ({
    provider: m.provider,
    id: m.id,
    name: m.name,
  }));
}

/** Get current state summary */
export function getState(): {
  streaming: boolean;
  model?: string;
  sessionId: string;
  cwd: string | null;
  messageCount: number;
} {
  if (!currentHandle) {
    return {
      streaming: false,
      sessionId: "",
      cwd: currentCwd,
      messageCount: 0,
    };
  }

  const session = currentHandle.session;
  const model = session.model;

  return {
    streaming: session.isStreaming,
    model: model ? `${model.provider}/${model.id}` : undefined,
    sessionId: session.sessionId,
    cwd: currentCwd,
    messageCount: session.messages.length,
  };
}

/** Get message history */
export function getMessages(): unknown[] {
  if (!currentHandle) return [];
  return currentHandle.session.messages;
}

/** Compact the session */
export async function compact(customInstructions?: string): Promise<void> {
  if (!currentHandle) throw new Error("No active session.");
  await currentHandle.session.compact(customInstructions);
}

// ── Internal ───────────────────────────────────────────────────────

function forwardAgentEvent(event: AgentSessionEvent): void {
  const bridgeEvent: AgentStreamEvent = {
    type: "agent_event",
    event: event.type,
    data: event,
  };
  writeEvent(bridgeEvent);
}

function emitStateChanged(handle: AgentHandle): void {
  const model = handle.session.model;
  const stateEvent: StateChangedEvent = {
    type: "state_changed",
    streaming: handle.session.isStreaming,
    model: model ? `${model.provider}/${model.id}` : undefined,
    sessionId: handle.session.sessionId,
    cwd: currentCwd ?? undefined,
  };
  writeEvent(stateEvent);
}
