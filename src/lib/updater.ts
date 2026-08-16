/**
 * Checks for updates and installs them if available.
 * This can be called on app startup or via a settings menu.
 * @param silent If true, don't show any alerts if no update is found.
 */
export async function checkForUpdates(silent = true) {
  if (typeof window === 'undefined' || !window.listenOS) return;

  try {
    const update = await window.listenOS.updates.check(silent);
    if (update.available) {
      console.log(`Downloading ListenOS ${update.version ?? 'update'}...`);
    } else if (!silent) {
      console.log('No update available');
    }
  } catch (error) {
    // Silently ignore - no release JSON exists yet or network issue
    if (!silent) {
      console.error('Failed to check for updates:', error);
    }
  }
}
