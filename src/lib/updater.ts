import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

/**
 * Checks for updates and installs them if available.
 * This can be called on app startup or via a settings menu.
 * @param silent If true, don't show any alerts if no update is found.
 */
export async function checkForUpdates(silent = true) {
  try {
    const update = await check();
    
    if (update) {
      console.log(
        `Found update ${update.version} from ${update.date} with body ${update.body}`
      );
      
      let downloaded = 0;
      let contentLength: number | undefined = 0;

      // Start the update
      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case 'Started':
            contentLength = event.data.contentLength;
            console.log(`Started downloading ${contentLength} bytes`);
            break;
          case 'Progress':
            downloaded += event.data.chunkLength;
            console.log(`Downloaded ${downloaded} from ${contentLength}`);
            break;
          case 'Finished':
            console.log('Download finished');
            break;
        }
      });

      console.log('Update installed, relaunching...');
      await relaunch();
    } else {
      if (!silent) {
        console.log('No update available');
      }
    }
  } catch (error) {
    console.error('Failed to check for updates:', error);
  }
}
