import { ipcMain } from 'electron';
import { DownloadManager } from '../downloader/DownloadManager';

export function registerHistoryHandlers(downloadManager: DownloadManager): void {
  ipcMain.handle('history:get', () => {
    return downloadManager.getHistory();
  });

  ipcMain.handle('history:clear', () => {
    return downloadManager.clearHistory();
  });

  ipcMain.handle('history:deleteItem', (_event, id: string) => {
    return downloadManager.deleteHistoryItem(id);
  });
}
