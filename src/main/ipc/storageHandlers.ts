import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import { StorageManager } from '../storage/storageManager';

export function registerStorageHandlers(
  storageManager: StorageManager,
  windowGetter: () => BrowserWindow | null
): void {
  ipcMain.handle('storage:getOverview', async () => {
    return await storageManager.getStorageOverview();
  });

  ipcMain.handle('storage:deleteWatched', async (_event, titleId?: unknown) => {
    const validTitleId = typeof titleId === 'string' && titleId.trim() ? titleId.trim() : undefined;
    return await storageManager.deleteWatchedEpisodes(validTitleId);
  });

  ipcMain.handle('storage:migrate', async (_event, newPath: unknown, moveFiles: unknown) => {
    if (typeof newPath !== 'string' || !newPath.trim()) {
      return { success: false, movedCount: 0, error: 'Invalid destination path' };
    }
    return await storageManager.migrateLibraryLocation(newPath.trim(), Boolean(moveFiles));
  });

  ipcMain.handle('storage:openLibraryFolder', async () => {
    const libPath = storageManager.getLibraryPath();
    try {
      if (fs.existsSync(libPath)) {
        await shell.openPath(libPath);
        return true;
      }
    } catch (err) {
      console.error('[Storage] Failed to open library folder:', err);
    }
    return false;
  });

  ipcMain.handle('storage:selectNewLocation', async () => {
    const win = windowGetter();
    const options = {
      title: 'Select New Base Directory for BatchFetch Library',
      properties: ['openDirectory', 'createDirectory'] as ('openDirectory' | 'createDirectory')[],
    };
    const result = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
}
