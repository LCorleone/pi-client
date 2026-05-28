// Keyboard shortcuts — registered on window keydown
// These work when the app is focused

export interface ShortcutMap {
  [key: string]: () => void;
}

let registered = false;
let shortcuts: ShortcutMap = {};

/** Register all keyboard shortcuts */
export function registerShortcuts(map: ShortcutMap): () => void {
  shortcuts = map;

  if (!registered) {
    registered = true;
    window.addEventListener("keydown", handleKeydown);
  }

  // Return unregister function
  return () => {
    window.removeEventListener("keydown", handleKeydown);
    registered = false;
    shortcuts = {};
  };
}

function handleKeydown(e: KeyboardEvent) {
  // Don't capture shortcuts when typing in input/textarea
  const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") {
    // Allow Escape even in inputs
    if (e.key === "Escape") {
      // Handled by InputEditor component
      return;
    }
    return;
  }

  const ctrl = e.ctrlKey || e.metaKey;
  const shift = e.shiftKey;

  // Build a key string like "ctrl+n", "ctrl+shift+n"
  let key = "";
  if (ctrl) key += "ctrl+";
  if (shift) key += "shift+";
  key += e.key.toLowerCase();

  const handler = shortcuts[key];
  if (handler) {
    e.preventDefault();
    handler();
  }
}

// ── Predefined shortcut keys ──────────────────────────────────────

export const Keys = {
  NEW_SESSION: "ctrl+n",
  NEW_SESSION_FOLDER: "ctrl+shift+n",
  SETTINGS: "ctrl+,",
  TOGGLE_SIDEBAR: "ctrl+b",
  CLEAR_CHAT: "ctrl+l",
  COPY_LAST: "ctrl+shift+c",
  MODEL_SELECTOR: "ctrl+shift+m",
  TOGGLE_THEME: "ctrl+shift+t",
} as const;
