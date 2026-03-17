import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

export async function checkForAppUpdates() {
  try {
    const update = await check();
    if (update) {
      console.log(`Found update ${update.version} published at ${update.date}`);
      return update; 
    }
    return null; 
  } catch (error) {
    console.error("Failed to check for updates:", error);
    return null;
  }
}

export async function installUpdateAndRestart(update: any) {
  try {
    await update.downloadAndInstall();
    await relaunch();
  } catch (error) {
    console.error("Failed to install update:", error);
    throw error;
  }
}