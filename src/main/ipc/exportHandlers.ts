import { ipcMain, dialog, shell, BrowserWindow } from 'electron';
import fs from 'fs';
import { ExportManager } from '../export/exportManager';
import { DriveDetector } from '../export/driveDetector';
import { ExportRequestPayload } from '../../shared/types/export';

export function registerExportHandlers(
  exportManager: ExportManager,
  windowGetter: () => BrowserWindow | null
): void {
  ipcMain.handle('export:start', async (_event, payload: ExportRequestPayload) => {
    return await exportManager.startExport(payload);
  });

  ipcMain.handle('export:cancel', (_event, jobId: unknown) => {
    if (typeof jobId !== 'string') return false;
    return exportManager.cancelExport(jobId);
  });

  ipcMain.handle('export:getJobs', () => {
    return exportManager.getJobs();
  });

  ipcMain.handle('export:getDrives', async () => {
    return await DriveDetector.getAvailableDrives();
  });

  ipcMain.handle('export:selectFolder', async () => {
    const win = windowGetter();
    const options = {
      title: 'Select Destination Folder for Video Export',
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

  ipcMain.handle('export:openFolder', async (_event, folderPath: unknown) => {
    if (typeof folderPath !== 'string' || !folderPath.trim()) return false;
    try {
      if (fs.existsSync(folderPath)) {
        await shell.openPath(folderPath);
        return true;
      }
    } catch (err) {
      console.error('[Export] Failed to open folder:', err);
    }
    return false;
  });
}
