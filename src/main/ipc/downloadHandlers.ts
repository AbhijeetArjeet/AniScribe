import { ipcMain, dialog, BrowserWindow } from 'electron';
import fs from 'fs';
import path from 'path';
import { DownloadManager } from '../downloader/DownloadManager';
import { AddDownloadsPayload, DownloadSeasonPayload } from '../../shared/types/ipc';
import { LibraryRepository } from '../library/libraryRepository';

export function registerDownloadHandlers(
  downloadManager: DownloadManager,
  windowGetter: () => BrowserWindow | null,
  libraryRepository?: LibraryRepository
): void {
  ipcMain.handle('downloads:add', async (_event, payload: AddDownloadsPayload) => {
    if (!payload || typeof payload !== 'object' || !Array.isArray(payload.urls)) {
      throw new Error('Invalid payload: urls array is required');
    }

    if (payload.urls.length > 500) {
      throw new Error('Batch size exceeds maximum limit of 500 URLs');
    }

    // Sanitize and validate every URL
    const sanitizedUrls: string[] = [];
    for (const u of payload.urls) {
      if (typeof u !== 'string') continue;
      const trimmed = u.trim();
      if (!trimmed) continue;
      const validation = DownloadManager.validateUrl(trimmed);
      if (!validation.valid) {
        throw new Error(`Invalid URL "${trimmed}": ${validation.error}`);
      }
      sanitizedUrls.push(trimmed);
    }

    if (sanitizedUrls.length === 0) {
      throw new Error('No valid URLs provided');
    }

    // Sanitize template context
    const sanitizedContext = payload.templateContext
      ? {
          title: typeof payload.templateContext.title === 'string' ? payload.templateContext.title.slice(0, 100).trim() : undefined,
          episode: typeof payload.templateContext.episode === 'string' ? payload.templateContext.episode.slice(0, 50).trim() : undefined,
          quality: typeof payload.templateContext.quality === 'string' ? payload.templateContext.quality.slice(0, 50).trim() : undefined,
        }
      : undefined;

    return await downloadManager.addUrls(sanitizedUrls, sanitizedContext);
  });

  ipcMain.handle('downloads:downloadSeason', async (_event, payload: DownloadSeasonPayload) => {
    if (!payload || !payload.title || !Array.isArray(payload.episodes)) {
      throw new Error('Invalid season download payload');
    }

    const { title, seasonNumber, episodes, quality, variants } = payload;

    // 1. Ensure Title, Season, and Episodes exist in LibraryRepository
    if (libraryRepository) {
      libraryRepository.upsertTitle({
        id: title.id,
        name: title.title,
        originalName: title.originalTitle,
        description: title.description,
        posterPath: title.posterUrl,
        backdropPath: title.backdropUrl,
        authorizedSource: title.authorizedSource,
        createdAt: Date.now(),
      });

      const seasonId = `${title.id}-s${seasonNumber}`;
      libraryRepository.upsertSeason({
        id: seasonId,
        titleId: title.id,
        seasonNumber,
        name: `Season ${seasonNumber}`,
        episodeCount: episodes.length,
      });

      for (const ep of episodes) {
        libraryRepository.upsertEpisode({
          id: ep.id,
          seasonId,
          titleId: title.id,
          episodeNumber: ep.episodeNumber,
          name: ep.name,
          durationSeconds: ep.durationSeconds,
          thumbnailPath: ep.thumbnailUrl,
        });
      }
    }

    // 2. Queue downloads for each episode with direct authorized URL
    const allAdded: any[] = [];
    for (const ep of episodes) {
      const variant = variants[ep.id];
      if (!variant || !variant.directUrl) continue;

      const seasonPad = String(seasonNumber).padStart(2, '0');
      const epPad = String(ep.episodeNumber).padStart(2, '0');

      const added = await downloadManager.addUrls([variant.directUrl], {
        title: title.title,
        episode: `S${seasonPad}E${epPad}`,
        quality: variant.quality || quality,
      });
      allAdded.push(...added);
    }

    return allAdded;
  });

  ipcMain.handle('downloads:pause', (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return false;
    return downloadManager.pause(id.trim());
  });

  ipcMain.handle('downloads:resume', (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return false;
    return downloadManager.resume(id.trim());
  });

  ipcMain.handle('downloads:cancel', (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return false;
    return downloadManager.cancel(id.trim());
  });

  ipcMain.handle('downloads:retry', (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return false;
    return downloadManager.retry(id.trim());
  });

  ipcMain.handle('downloads:remove', (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return false;
    return downloadManager.remove(id.trim());
  });

  ipcMain.handle('downloads:getAll', () => {
    return downloadManager.getAll();
  });

  ipcMain.handle('downloads:reorder', (_event, id: unknown, newIndex: unknown) => {
    if (typeof id !== 'string' || typeof newIndex !== 'number' || !Number.isInteger(newIndex) || newIndex < 0) {
      return false;
    }
    return downloadManager.reorder(id, newIndex);
  });

  ipcMain.handle('downloads:openFolder', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath.trim()) {
      return false;
    }
    const cleanPath = path.normalize(filePath.trim());
    if (!path.isAbsolute(cleanPath) || cleanPath.includes('\0')) {
      console.warn('[Security] Blocked attempt to open non-absolute or invalid path:', filePath);
      return false;
    }
    return downloadManager.openFolder(cleanPath);
  });

  ipcMain.handle('downloads:selectDirectory', async () => {
    const win = windowGetter();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openDirectory', 'createDirectory'],
      title: 'Select Download Directory',
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return path.normalize(result.filePaths[0]);
  });

  ipcMain.handle('downloads:importTxt', async () => {
    const win = windowGetter();
    const result = await dialog.showOpenDialog(win!, {
      properties: ['openFile'],
      filters: [{ name: 'Text files', extensions: ['txt'] }, { name: 'All files', extensions: ['*'] }],
      title: 'Import URLs from TXT file',
    });

    if (result.canceled || result.filePaths.length === 0) {
      return [];
    }

    const filePath = result.filePaths[0];
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#') && (line.startsWith('http://') || line.startsWith('https://')));

    return lines;
  });
}
