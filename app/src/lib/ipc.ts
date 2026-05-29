// Typed wrappers around Tauri IPC

import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

// ── Agent Event Types ──────────────────────────────────────────────

export interface TextDeltaEvent {
  type: "text_delta";
  contentIndex: number;
  delta: string;
}

export interface ThinkingDeltaEvent {
  type: "thinking_delta";
  delta: string;
}

export interface ToolCallStartEvent {
  type: "tool_call_start";
  toolCallId: string;
  toolName: string;
  args: Record<string, unknown>;
}

export interface ToolCallUpdateEvent {
  type: "tool_call_update";
  toolCallId: string;
  partialResult: { content: Array<{ type: string; text: string }> };
}

export interface ToolCallEndEvent {
  type: "tool_call_end";
  toolCallId: string;
  result: { content: Array<{ type: string; text: string }> };
  isError: boolean;
}

export interface AgentStartEvent {
  type: "agent_start";
}

export interface AgentEndEvent {
  type: "agent_end";
  messages: unknown[];
}

export interface MessageStartEvent {
  type: "message_start";
  message: unknown;
}

export interface MessageEndEvent {
  type: "message_end";
  message: unknown;
}

export interface BridgeReadyEvent {
  type: "bridge_ready";
}

export interface BridgeErrorEvent {
  type: "bridge_error";
  error: string;
  id?: string;
}

export interface ResponseEvent {
  type: "response";
  id: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface AgentStreamEvent {
  type: "agent_event";
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

export type AgentEvent =
  | TextDeltaEvent
  | ThinkingDeltaEvent
  | ToolCallStartEvent
  | ToolCallUpdateEvent
  | ToolCallEndEvent
  | AgentStartEvent
  | AgentEndEvent
  | MessageStartEvent
  | MessageEndEvent
  | BridgeReadyEvent
  | BridgeErrorEvent
  | ResponseEvent
  | AgentStreamEvent
  | StateChangedEvent
  | { type: string; [key: string]: unknown };

// ── Types ──────────────────────────────────────────────────────────

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
}

export interface SessionState {
  streaming: boolean;
  model?: string;
  sessionId: string;
  cwd?: string;
  messageCount: number;
}

export interface SessionMeta {
  id: string;
  name: string;
  cwd: string;
  model: ModelInfo | null;
  messageCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface SavedSession {
  id: string;
  name: string;
  cwd: string;
  model: ModelInfo | null;
  messages: Array<Record<string, unknown>>;
  createdAt: number;
  updatedAt: number;
}

// ── File Browser Types ─────────────────────────────────────────────

export interface FileEntry {
  name: string;
  path: string;
  is_dir: boolean;
  children: FileEntry[] | null;
}

// ── Settings Types ─────────────────────────────────────────────────

export interface ProviderConfig {
  name: string;
  api_url: string;
  api_key: string;
  models: string[];
}

export interface CustomToolConfig {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: "fetch" | "exec" | "log";
  url?: string;
  command?: string;
}

export interface AppSettings {
  theme: string;
  providers: ProviderConfig[];
  default_provider: string;
  shell_path: string | null;
  font_size: number;
  custom_tools: CustomToolConfig[];
  system_prompt: string | null;
  setup_completed: boolean;
}

// ── Image Types ────────────────────────────────────────────────────

export interface ImageData {
  dataUrl: string;
  name: string;
}

// ── Session Persistence Commands ───────────────────────────────────

export async function listSessions(): Promise<SessionMeta[]> {
  return invoke("list_sessions");
}

export async function loadSession(sessionId: string): Promise<SavedSession> {
  return invoke("load_session", { sessionId });
}

export async function saveSession(session: SavedSession): Promise<void> {
  return invoke("save_session", { session });
}

export async function deleteSession(sessionId: string): Promise<void> {
  return invoke("delete_session", { sessionId });
}

export async function renameSession(sessionId: string, name: string): Promise<void> {
  return invoke("rename_session", { sessionId, name });
}

export async function getLastSessionId(): Promise<string | null> {
  return invoke("get_last_session_id");
}

// ── Bridge Commands (invoke) ───────────────────────────────────────

export async function sendPrompt(message: string, images?: ImageData[]): Promise<void> {
  return invoke("send_prompt", { message, images });
}

export async function initSession(cwd: string, sessionId?: string): Promise<void> {
  return invoke("init_session", { cwd, sessionId });
}

export async function abortAgent(): Promise<void> {
  return invoke("abort_agent");
}

export async function setModel(provider: string, modelId: string): Promise<void> {
  return invoke("set_model", { provider, modelId });
}

export async function getModels(): Promise<{ models: ModelInfo[] }> {
  return invoke("get_models");
}

export async function getState(): Promise<SessionState> {
  return invoke("get_state");
}

export async function getMessages(): Promise<{ messages: unknown[] }> {
  return invoke("get_messages");
}

export async function newSession(): Promise<void> {
  return invoke("new_session");
}

export async function pickDirectory(): Promise<string | null> {
  return invoke("pick_directory");
}

export async function testApiConnection(apiUrl: string, apiKey: string): Promise<boolean> {
  return invoke("test_api_connection", { apiUrl, apiKey });
}

export async function steer(message: string): Promise<void> {
  return invoke("steer", { message });
}

export async function compact(customInstructions?: string): Promise<void> {
  return invoke("compact", { customInstructions });
}

// ── File Browser Commands ─────────────────────────────────────────

export async function listFiles(dir: string, depth?: number): Promise<FileEntry[]> {
  return invoke("list_files", { dir, depth });
}

// ── Settings Commands ──────────────────────────────────────────────

export async function getSettings(): Promise<AppSettings> {
  return invoke("get_settings");
}

export async function saveSettings(settings: AppSettings): Promise<void> {
  return invoke("save_settings", { settings });
}

export async function updateBridgeConfig(config: Record<string, unknown>): Promise<void> {
  return invoke("update_bridge_config", { config });
}

// ── Event listener ─────────────────────────────────────────────────

export function onAgentEvent(callback: (event: AgentEvent) => void): Promise<UnlistenFn> {
  return listen<AgentEvent>("agent_event", (e) => callback(e.payload));
}

// ── Tauri availability check ───────────────────────────────────────

export function isTauriAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}
