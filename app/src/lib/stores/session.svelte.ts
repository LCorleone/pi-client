// Reactive session state using Svelte 5 runes
// Single source of truth — components read from here, only the event handler writes

import type { ModelInfo } from "../ipc.js";

// ── Types ──────────────────────────────────────────────────────────

export interface ToolCall {
  id: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "done" | "error";
  output?: string;
  partialOutput?: string;
}

export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  images?: { dataUrl: string; name: string }[];
  timestamp: number;
}

// ── State ──────────────────────────────────────────────────────────

let messages = $state<Message[]>([]);
let isStreaming = $state(false);
let currentModel = $state<ModelInfo | null>(null);
let availableModels = $state<ModelInfo[]>([]);
let sessionId = $state<string | null>(null);
let cwd = $state<string | null>(null);
let sessionName = $state<string>("");
let bridgeReady = $state(false);
let initialized = $state(false);
let error = $state<string | undefined>(undefined);

// Streaming buffers — accumulate deltas until message_end
let streamingText = $state("");
let streamingThinking = $state("");
let activeToolCalls = $state<Map<string, ToolCall>>(new Map());

// Pending images (pasted but not yet sent)
let pendingImages = $state<{ dataUrl: string; name: string }[]>([]);

// ── Derived ────────────────────────────────────────────────────────

let messageCount = $derived(messages.length);
let lastMessage = $derived(messages[messages.length - 1]);

// ── Helpers ────────────────────────────────────────────────────────

let _nextId = 0;
function nextId(): string {
  return `msg_${Date.now()}_${_nextId++}`;
}

// ── Event Handler ──────────────────────────────────────────────────

function handleAgentEvent(event: Record<string, unknown>): void {
  // Bridge wraps Pi events in { type: "agent_event", event: "...", data: {...} }
  // We need to unwrap and dispatch based on the inner event type
  if (event.type === "agent_event" && event.event && event.data) {
    const innerType = event.event as string;
    const data = event.data as Record<string, unknown>;
    // The data itself contains the full event with type field from Pi SDK
    handlePiEvent(innerType, data);
    return;
  }

  // Direct events from bridge
  switch (event.type) {
    case "bridge_ready":
      bridgeReady = true;
      break;

    case "bridge_error":
      error = event.error as string;
      break;

    case "response":
      handleResponse(event);
      break;

    case "state_changed":
      handleStateChanged(event);
      break;
  }
}

function handlePiEvent(eventType: string, data: Record<string, unknown>): void {
  switch (eventType) {
    case "agent_start":
      isStreaming = true;
      activeToolCalls = new Map();
      break;

    case "agent_end":
      isStreaming = false;
      // Flush any remaining streaming text into a message
      flushStreamingMessage();
      activeToolCalls = new Map();
      break;

    case "message_start":
      // New message starting — we'll accumulate content
      break;

    case "message_end":
      flushStreamingMessage();
      break;

    case "text_delta":
      streamingText += data.delta ?? "";
      break;

    case "thinking_delta":
      streamingThinking += data.delta ?? "";
      break;

    case "tool_call_start": {
      const tc: ToolCall = {
        id: (data.toolCallId as string) ?? nextId(),
        name: (data.toolName as string) ?? "unknown",
        args: (data.args as Record<string, unknown>) ?? {},
        status: "running",
      };
      const newMap = new Map(activeToolCalls);
      newMap.set(tc.id, tc);
      activeToolCalls = newMap;
      break;
    }

    case "tool_call_update": {
      const tcId = data.toolCallId as string;
      const existing = activeToolCalls.get(tcId);
      if (existing) {
        const partial = data.partialResult as { content: Array<{ type: string; text: string }> };
        const newMap = new Map(activeToolCalls);
        newMap.set(tcId, {
          ...existing,
          partialOutput: partial?.content?.map((c) => c.text).join("\n") ?? "",
        });
        activeToolCalls = newMap;
      }
      break;
    }

    case "tool_call_end": {
      const tcId = data.toolCallId as string;
      const existing = activeToolCalls.get(tcId);
      if (existing) {
        const result = data.result as { content: Array<{ type: string; text: string }> };
        const newMap = new Map(activeToolCalls);
        newMap.set(tcId, {
          ...existing,
          status: (data.isError as boolean) ? "error" : "done",
          output: result?.content?.map((c) => c.text).join("\n") ?? existing.partialOutput ?? "",
        });
        activeToolCalls = newMap;
      }
      break;
    }
  }
}

function handleResponse(event: Record<string, unknown>): void {
  if (!event.success && event.error) {
    error = event.error as string;
    return;
  }

  if (event.data) {
    const data = event.data as Record<string, unknown>;

    // Model list response
    if (data.models) {
      availableModels = data.models as ModelInfo[];
    }

    // State response
    if (data.streaming !== undefined) {
      isStreaming = data.streaming as boolean;
    }
    if (data.model) {
      const modelStr = data.model as string;
      const parts = modelStr.split("/");
      if (parts.length === 2) {
        currentModel = { provider: parts[0], id: parts[1], name: parts[1] };
      }
    }
    if (data.sessionId) {
      sessionId = data.sessionId as string;
    }
    if (data.cwd) {
      cwd = data.cwd as string;
    }
  }
}

function handleStateChanged(event: Record<string, unknown>): void {
  if (event.streaming !== undefined) {
    isStreaming = event.streaming as boolean;
  }
  if (event.model) {
    const modelStr = event.model as string;
    const parts = modelStr.split("/");
    if (parts.length === 2) {
      currentModel = { provider: parts[0], id: parts[1], name: parts[1] };
    }
  }
  if (event.sessionId) {
    sessionId = event.sessionId as string;
  }
  if (event.cwd) {
    cwd = event.cwd as string;
  }
}

function flushStreamingMessage(): void {
  if (!streamingText && !streamingThinking && activeToolCalls.size === 0) return;

  // Collect all tool calls into the message (including still-running ones)
  const toolCalls: ToolCall[] = [];
  for (const tc of activeToolCalls.values()) {
    toolCalls.push({ ...tc });
  }

  const msg: Message = {
    id: nextId(),
    role: "assistant",
    content: streamingText,
    thinking: streamingThinking || undefined,
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    timestamp: Date.now(),
  };

  messages = [...messages, msg];
  streamingText = "";
  streamingThinking = "";
  activeToolCalls = new Map();
}

function addUserMessage(text: string, images?: { dataUrl: string; name: string }[]): void {
  const msg: Message = {
    id: nextId(),
    role: "user",
    content: text,
    images: images && images.length > 0 ? images : undefined,
    timestamp: Date.now(),
  };
  messages = [...messages, msg];
}

function reset(): void {
  messages = [];
  isStreaming = false;
  currentModel = null;
  availableModels = [];
  sessionId = null;
  cwd = null;
  sessionName = "";
  bridgeReady = false;
  initialized = false;
  error = undefined;
  streamingText = "";
  streamingThinking = "";
  activeToolCalls = new Map();
}

/** Load saved messages from a persisted session (restores chat history) */
function loadSavedMessages(savedMessages: Array<Record<string, unknown>>): void {
  messages = savedMessages.map((m) => ({
    id: (m.id as string) ?? nextId(),
    role: (m.role as "user" | "assistant") ?? "assistant",
    content: (m.content as string) ?? "",
    thinking: m.thinking as string | undefined,
    toolCalls: m.toolCalls as ToolCall[] | undefined,
    images: m.images as { dataUrl: string; name: string }[] | undefined,
    timestamp: (m.timestamp as number) ?? Date.now(),
  }));
}

/** Serialize messages for persistence */
function toSerializableMessages(): Array<Record<string, unknown>> {
  return messages.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    thinking: m.thinking,
    toolCalls: m.toolCalls,
    images: m.images,
    timestamp: m.timestamp,
  }));
}

// ── Export as a class so $state works properly in Svelte 5 modules ─

class SessionStore {
  get messages() {
    return messages;
  }
  get isStreaming() {
    return isStreaming;
  }
  set isStreaming(v: boolean) {
    isStreaming = v;
  }
  get currentModel() {
    return currentModel;
  }
  set currentModel(v: ModelInfo | null) {
    currentModel = v;
  }
  get availableModels() {
    return availableModels;
  }
  set availableModels(v: ModelInfo[]) {
    availableModels = v;
  }
  get sessionId() {
    return sessionId;
  }
  set sessionId(v: string | null) {
    sessionId = v;
  }
  get cwd() {
    return cwd;
  }
  set cwd(v: string | null) {
    cwd = v;
  }
  get sessionName() {
    return sessionName;
  }
  set sessionName(v: string) {
    sessionName = v;
  }
  get bridgeReady() {
    return bridgeReady;
  }
  set bridgeReady(v: boolean) {
    bridgeReady = v;
  }
  get initialized() {
    return initialized;
  }
  set initialized(v: boolean) {
    initialized = v;
  }
  get error() {
    return error;
  }
  set error(v: string | undefined) {
    error = v;
  }
  get streamingText() {
    return streamingText;
  }
  get streamingThinking() {
    return streamingThinking;
  }
  get activeToolCalls() {
    return activeToolCalls;
  }
  get pendingImages() {
    return pendingImages;
  }

  // Derived
  get messageCount() {
    return messageCount;
  }
  get lastMessage() {
    return lastMessage;
  }

  // Actions
  handleAgentEvent = handleAgentEvent;
  addUserMessage = addUserMessage;
  reset = reset;
  loadSavedMessages = loadSavedMessages;
  toSerializableMessages = toSerializableMessages;

  // Image handling
  addPendingImage(image: { dataUrl: string; name: string }) {
    pendingImages = [...pendingImages, image];
  }

  removePendingImage(index: number) {
    pendingImages = pendingImages.filter((_, i) => i !== index);
  }

  clearPendingImages() {
    pendingImages = [];
  }

  getPendingImages(): { dataUrl: string; name: string }[] {
    return pendingImages;
  }
}

export const session = new SessionStore();
