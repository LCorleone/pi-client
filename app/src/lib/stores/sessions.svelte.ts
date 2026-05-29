// Session list management store — handles persistence, switching, auto-save

import {
  listSessions,
  loadSession,
  saveSession,
  deleteSession as deleteSessionIpc,
  renameSession as renameSessionIpc,
  initSession,
  getModels,
  type SessionMeta,
  type SavedSession,
} from "../ipc.js";
import { session } from "./session.svelte.js";

// ── Types ──────────────────────────────────────────────────────────

export type { SessionMeta, SavedSession };

// ── State ──────────────────────────────────────────────────────────

let sessionList = $state<SessionMeta[]>([]);
let currentSessionId = $state<string | null>(null);
let isLoading = $state(false);
let showSidebar = $state(true);
let dirty = $state(false);
let saveTimer: ReturnType<typeof setTimeout> | null = null;

// ── Auto-save config ───────────────────────────────────────────────

const SAVE_DEBOUNCE_MS = 5000; // Save after 5s idle during streaming
const SAVE_ON_END_IMMEDIATE = true;

// ── Derived ────────────────────────────────────────────────────────

let currentSession = $derived(
  sessionList.find((s) => s.id === currentSessionId) ?? null
);

let hasSessions = $derived(sessionList.length > 0);

// ── Helpers ────────────────────────────────────────────────────────

/** Extract a human-readable name from a file path */
function dirName(path: string): string {
  // Handle both Windows (\) and Unix (/) paths
  const parts = path.replace(/\\/g, "/").split("/");
  // Get last non-empty segment
  for (let i = parts.length - 1; i >= 0; i--) {
    if (parts[i]) return parts[i];
  }
  return path;
}

/** Generate a short session ID */
function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

/** Mark session as needing save */
function markDirty() {
  dirty = true;
  // Debounced save during streaming
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveCurrentSession();
  }, SAVE_DEBOUNCE_MS);
}

// ── Actions ────────────────────────────────────────────────────────

/** Load the session list from disk (call on app start) */
async function loadSessionList(): Promise<void> {
  isLoading = true;
  try {
    sessionList = await listSessions();
  } catch (err) {
    console.error("[Sessions] Failed to load session list:", err);
    sessionList = [];
  } finally {
    isLoading = false;
  }
}

/** Create a new session for the given working directory */
async function createSession(cwd: string): Promise<string> {
  const id = generateId();
  const name = dirName(cwd);
  const now = Date.now();

  // Init the bridge with the new cwd
  await initSession(cwd);

  // Update session store
  session.reset();
  session.cwd = cwd;
  session.sessionId = id;
  session.initialized = true;

  // Add to local list
  const meta: SessionMeta = {
    id,
    name,
    cwd,
    model: null,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
  };
  sessionList = [meta, ...sessionList];
  currentSessionId = id;

  // Persist immediately
  await saveCurrentSession();

  // Load models
  try {
    const result = await getModels();
    if (result?.models) {
      session.availableModels = result.models;
    }
  } catch {
    // Models may not be available yet
  }

  return id;
}

/** Switch to a different session */
async function switchSession(id: string): Promise<void> {
  if (id === currentSessionId) return;

  // Save current session first
  if (currentSessionId && dirty) {
    await saveCurrentSession();
  }

  // Abort if streaming
  if (session.isStreaming) {
    try {
      const { abortAgent } = await import("../ipc.js");
      await abortAgent();
    } catch {
      // Ignore abort errors
    }
  }

  isLoading = true;
  try {
    // Load the saved session from disk
    const saved = await loadSession(id);

    // Clear current session state and load saved messages
    session.reset();
    session.loadSavedMessages(saved.messages);
    session.sessionId = id;
    session.cwd = saved.cwd;
    session.initialized = true;

    if (saved.model) {
      session.currentModel = saved.model;
    }

    currentSessionId = id;
    dirty = false;

    // Re-init the bridge with the session's cwd and sessionId
    await initSession(saved.cwd, id);

    // Load models
    try {
      const result = await getModels();
      if (result?.models) {
        session.availableModels = result.models;
      }
    } catch {
      // Models may not be available yet
    }
  } catch (err) {
    console.error("[Sessions] Failed to switch session:", err);
  } finally {
    isLoading = false;
  }
}

/** Delete a session */
async function removeSession(id: string): Promise<void> {
  // If deleting current session, clear UI
  if (id === currentSessionId) {
    session.reset();
    currentSessionId = null;
  }

  // Remove from list
  sessionList = sessionList.filter((s) => s.id !== id);

  // Delete from disk
  try {
    await deleteSessionIpc(id);
  } catch (err) {
    console.error("[Sessions] Failed to delete session:", err);
  }
}

/** Rename a session */
async function renameSession(id: string, name: string): Promise<void> {
  // Update local list
  sessionList = sessionList.map((s) =>
    s.id === id ? { ...s, name, updatedAt: Date.now() } : s
  );

  // Persist
  try {
    await renameSessionIpc(id, name);
  } catch (err) {
    console.error("[Sessions] Failed to rename session:", err);
  }
}

/** Save the current session to disk */
async function saveCurrentSession(): Promise<void> {
  if (!currentSessionId || !session.cwd) return;

  const now = Date.now();
  const saved: SavedSession = {
    id: currentSessionId,
    name: currentSession?.name ?? dirName(session.cwd),
    cwd: session.cwd,
    model: session.currentModel,
    messages: session.toSerializableMessages(),
    createdAt: currentSession?.createdAt ?? now,
    updatedAt: now,
  };

  try {
    await saveSession(saved);
    dirty = false;

    // Update local list entry
    sessionList = sessionList.map((s) =>
      s.id === currentSessionId
        ? {
            ...s,
            name: saved.name,
            model: saved.model,
            messageCount: saved.messages.length,
            updatedAt: now,
          }
        : s
    );
  } catch (err) {
    console.error("[Sessions] Failed to save session:", err);
  }
}

/** Called when agent_end fires — save immediately */
function onAgentEnd(): void {
  if (SAVE_ON_END_IMMEDIATE && currentSessionId) {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    saveCurrentSession();
  }
}

/** Toggle sidebar visibility */
function toggleSidebar(): void {
  showSidebar = !showSidebar;
}

/** Get relative time string */
function relativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const seconds = Math.floor(diff / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

// ── Export ─────────────────────────────────────────────────────────

class SessionsStore {
  get sessions() {
    return sessionList;
  }
  get currentSessionId() {
    return currentSessionId;
  }
  set currentSessionId(v: string | null) {
    currentSessionId = v;
  }
  get currentSession() {
    return currentSession;
  }
  get isLoading() {
    return isLoading;
  }
  get showSidebar() {
    return showSidebar;
  }
  get hasSessions() {
    return hasSessions;
  }
  get dirty() {
    return dirty;
  }

  // Actions
  loadSessionList = loadSessionList;
  createSession = createSession;
  switchSession = switchSession;
  removeSession = removeSession;
  renameSession = renameSession;
  saveCurrentSession = saveCurrentSession;
  onAgentEnd = onAgentEnd;
  toggleSidebar = toggleSidebar;
  markDirty = markDirty;
  relativeTime = relativeTime;
}

export const sessions = new SessionsStore();
