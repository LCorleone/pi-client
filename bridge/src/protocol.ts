// Bridge protocol types and helpers

// ── Commands (Tauri → Bridge) ──────────────────────────────────────

export interface BaseCommand {
  id: string;
}

export interface InitCommand extends BaseCommand {
  type: "init";
  cwd: string;
  sessionId?: string;
}

export interface PromptCommand extends BaseCommand {
  type: "prompt";
  message: string;
  images?: ImageData[];
}

export interface ImageData {
  dataUrl: string;
  name: string;
}

export interface SteerCommand extends BaseCommand {
  type: "steer";
  message: string;
}

export interface FollowUpCommand extends BaseCommand {
  type: "follow_up";
  message: string;
}

export interface AbortCommand extends BaseCommand {
  type: "abort";
}

export interface SetModelCommand extends BaseCommand {
  type: "set_model";
  provider: string;
  modelId: string;
}

export interface GetModelsCommand extends BaseCommand {
  type: "get_models";
}

export interface GetStateCommand extends BaseCommand {
  type: "get_state";
}

export interface GetMessagesCommand extends BaseCommand {
  type: "get_messages";
}

export interface NewSessionCommand extends BaseCommand {
  type: "new_session";
}

export interface CompactCommand extends BaseCommand {
  type: "compact";
  customInstructions?: string;
}

export interface ShutdownCommand extends BaseCommand {
  type: "shutdown";
}

export interface PingCommand extends BaseCommand {
  type: "ping";
}

export interface SetConfigCommand extends BaseCommand {
  type: "set_config";
  config: {
    defaultProvider?: string;
    defaultModel?: string;
    systemPrompt?: string;
    customTools?: CustomToolDefinitionImport[];
  };
}

export interface GetConfigCommand extends BaseCommand {
  type: "get_config";
}

export interface CustomToolDefinitionImport {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: "fetch" | "exec" | "log";
  url?: string;
  command?: string;
}

export type BridgeCommand =
  | InitCommand
  | PromptCommand
  | SteerCommand
  | FollowUpCommand
  | AbortCommand
  | SetModelCommand
  | GetModelsCommand
  | GetStateCommand
  | GetMessagesCommand
  | NewSessionCommand
  | CompactCommand
  | ShutdownCommand
  | PingCommand
  | SetConfigCommand
  | GetConfigCommand;

// ── Events (Bridge → Tauri) ────────────────────────────────────────

export interface BridgeReadyEvent {
  type: "bridge_ready";
}

export interface ResponseEvent {
  type: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface BridgeErrorEvent {
  type: "bridge_error";
  id?: string;
  error: string;
}

export interface AgentStreamEvent {
  type: "agent_event";
  /** The raw event type from Pi SDK */
  event: string;
  data: unknown;
}

export interface StateChangedEvent {
  type: "state_changed";
  streaming: boolean;
  model?: string;
  sessionId?: string;
  cwd?: string;
}

export type BridgeEvent =
  | BridgeReadyEvent
  | ResponseEvent
  | BridgeErrorEvent
  | AgentStreamEvent
  | StateChangedEvent;

// ── Helpers ────────────────────────────────────────────────────────

export function writeEvent(event: BridgeEvent): void {
  process.stdout.write(JSON.stringify(event) + "\n");
}

export function parseCommand(line: string): BridgeCommand | null {
  try {
    const obj = JSON.parse(line);
    if (obj && typeof obj === "object" && typeof obj.type === "string") {
      return obj as BridgeCommand;
    }
    return null;
  } catch {
    return null;
  }
}
