// Auto-update checker — uses Tauri updater plugin
// Requires @tauri-apps/plugin-updater to be installed

type UpdateInfo = {
  available: boolean;
  version?: string;
  body?: string;
  downloadAndInstall: () => Promise<void>;
};

/**
 * Check for app updates.
 * Returns null if the updater plugin is not available (e.g., during dev).
 */
export async function checkForUpdates(): Promise<UpdateInfo | null> {
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();

    if (!update) {
      return { available: false, downloadAndInstall: async () => {} };
    }

    return {
      available: true,
      version: update.version,
      body: update.body ?? undefined,
      downloadAndInstall: async () => {
        await update.downloadAndInstall();
      },
    };
  } catch {
    // Plugin not available or not configured — silent fallback
    return null;
  }
}

/**
 * Check for updates and show a confirmation dialog if available.
 */
export async function checkAndPromptForUpdates(): Promise<boolean> {
  const update = await checkForUpdates();
  if (!update || !update.available) return false;

  const confirmed = window.confirm(
    `Update available: v${update.version}\n\n${update.body ?? "Download and install now?"}`
  );

  if (confirmed) {
    try {
      await update.downloadAndInstall();
      return true;
    } catch (err) {
      console.error("[Updater] Download/install failed:", err);
      window.alert("Update failed. Please try again later.");
      return false;
    }
  }

  return false;
}
