import { ipcMain } from 'electron';
import path from 'path';
import { DownloadManager } from '../downloader/DownloadManager';
import { AppSettings } from '../../shared/types/settings';

export function registerSettingsHandlers(downloadManager: DownloadManager): void {
  ipcMain.handle('settings:get', () => {
    return downloadManager.getSettings();
  });

  ipcMain.handle('settings:update', (_event, partial: unknown) => {
    if (!partial || typeof partial !== 'object') {
      throw new Error('Invalid settings payload');
    }

    const input = partial as Partial<AppSettings>;
    const sanitized: Partial<AppSettings> = {};

    if (typeof input.downloadDirectory === 'string') {
      const cleanDir = path.normalize(input.downloadDirectory.trim());
      if (path.isAbsolute(cleanDir) && !cleanDir.includes('\0')) {
        sanitized.downloadDirectory = cleanDir;
      }
    }

    if (typeof input.concurrency === 'number') {
      sanitized.concurrency = Math.max(1, Math.min(5, Math.floor(input.concurrency)));
    }

    if (typeof input.maxRetries === 'number') {
      sanitized.maxRetries = Math.max(0, Math.min(10, Math.floor(input.maxRetries)));
    }

    if (typeof input.connectionTimeoutMs === 'number') {
      sanitized.connectionTimeoutMs = Math.max(1000, Math.min(120000, Math.floor(input.connectionTimeoutMs)));
    }

    if (typeof input.retryDelayMs === 'number') {
      sanitized.retryDelayMs = Math.max(500, Math.min(60000, Math.floor(input.retryDelayMs)));
    }

    if (input.theme === 'dark' || input.theme === 'light' || input.theme === 'system') {
      sanitized.theme = input.theme;
    }

    if (typeof input.filenameTemplate === 'string') {
      sanitized.filenameTemplate = input.filenameTemplate.slice(0, 200).trim();
    }

    if (typeof input.overwriteExisting === 'boolean') {
      sanitized.overwriteExisting = input.overwriteExisting;
    }

    return downloadManager.updateSettings(sanitized);
  });
}
