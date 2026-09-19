import { ipcMain, dialog, BrowserWindow } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { LibraryRepository } from '../library/libraryRepository';
import { WatchProgress } from '../../shared/types/library';

export function registerPlayerHandlers(libraryRepository: LibraryRepository): void {
  ipcMain.handle('player:getProgress', (_event, episodeId: unknown) => {
    if (typeof episodeId !== 'string' || !episodeId.trim()) return null;
    return libraryRepository.getWatchProgress(episodeId.trim());
  });

  ipcMain.handle(
    'player:saveProgress',
    (_event, episodeId: unknown, titleId: unknown, positionSeconds: unknown, durationSeconds: unknown) => {
      if (
        typeof episodeId !== 'string' ||
        typeof titleId !== 'string' ||
        typeof positionSeconds !== 'number' ||
        typeof durationSeconds !== 'number'
      ) {
        return false;
      }

      const isCompleted = durationSeconds > 0 && positionSeconds >= durationSeconds * 0.9;
      const progress: WatchProgress = {
        id: `wp-${crypto.createHash('md5').update(episodeId).digest('hex').slice(0, 12)}`,
        episodeId: episodeId.trim(),
        titleId: titleId.trim(),
        positionSeconds: Math.max(0, positionSeconds),
        durationSeconds: Math.max(0, durationSeconds),
        isCompleted,
        lastWatchedAt: Date.now(),
      };

      libraryRepository.saveWatchProgress(progress);
      return true;
    }
  );

  ipcMain.handle('player:markWatched', (_event, episodeId: unknown, titleId: unknown, watched: unknown) => {
    if (typeof episodeId !== 'string' || typeof titleId !== 'string') return false;

    const existing = libraryRepository.getWatchProgress(episodeId.trim());
    const duration = existing?.durationSeconds || 1400;

    const progress: WatchProgress = {
      id: `wp-${crypto.createHash('md5').update(episodeId).digest('hex').slice(0, 12)}`,
      episodeId: episodeId.trim(),
      titleId: titleId.trim(),
      positionSeconds: watched ? duration : 0,
      durationSeconds: duration,
      isCompleted: Boolean(watched),
      lastWatchedAt: Date.now(),
    };

    libraryRepository.saveWatchProgress(progress);
    return true;
  });

  ipcMain.handle('player:getNextEpisode', (_event, episodeId: unknown) => {
    if (typeof episodeId !== 'string' || !episodeId.trim()) return null;
    return libraryRepository.getNextEpisode(episodeId.trim());
  });

  ipcMain.handle('player:getPreviousEpisode', (_event, episodeId: unknown) => {
    if (typeof episodeId !== 'string' || !episodeId.trim()) return null;
    return libraryRepository.getPreviousEpisode(episodeId.trim());
  });

  ipcMain.handle('player:findSubtitles', (_event, mediaFilePath: unknown) => {
    if (typeof mediaFilePath !== 'string' || !mediaFilePath.trim()) return [];
    try {
      const dir = path.dirname(mediaFilePath);
      if (!fs.existsSync(dir)) return [];

      const baseNameWithoutExt = path.basename(mediaFilePath, path.extname(mediaFilePath));
      const files = fs.readdirSync(dir);
      const subFiles: Array<{ label: string; filePath: string }> = [];

      for (const file of files) {
        const ext = path.extname(file).toLowerCase();
        if (ext === '.srt' || ext === '.vtt' || ext === '.ass') {
          const fullPath = path.join(dir, file);
          let label = file;
          if (file.toLowerCase().includes('.en.')) {
            label = 'English (AI/Embedded)';
          } else if (file.toLowerCase().includes('.ja.')) {
            label = 'Japanese';
          } else if (file.startsWith(baseNameWithoutExt)) {
            label = 'Local Subtitle';
          }
          subFiles.push({ label, filePath: fullPath });
        }
      }
      return subFiles;
    } catch (err) {
      console.warn('[PlayerHandlers] findSubtitles error:', err);
      return [];
    }
  });

  ipcMain.handle('player:selectSubtitleFile', async () => {
    const win = BrowserWindow.getFocusedWindow();
    const options = {
      title: 'Select Subtitle File',
      filters: [
        { name: 'Subtitles (*.srt, *.vtt, *.ass)', extensions: ['srt', 'vtt', 'ass'] },
        { name: 'All Files', extensions: ['*'] },
      ],
      properties: ['openFile'] as ('openFile')[],
    };

    const res = win
      ? await dialog.showOpenDialog(win, options)
      : await dialog.showOpenDialog(options);

    if (res.canceled || res.filePaths.length === 0) {
      return null;
    }

    const subPath = res.filePaths[0];
    try {
      const content = fs.readFileSync(subPath, 'utf8');
      return {
        label: path.basename(subPath),
        filePath: subPath,
        content,
      };
    } catch (err) {
      console.error('[PlayerHandlers] Failed to read selected subtitle:', err);
      return null;
    }
  });

  ipcMain.handle('player:readSubtitleContent', (_event, filePath: unknown) => {
    if (typeof filePath !== 'string' || !filePath.trim()) return null;
    try {
      if (!fs.existsSync(filePath)) return null;
      return fs.readFileSync(filePath, 'utf8');
    } catch (err) {
      console.error('[PlayerHandlers] Failed to read subtitle file:', err);
      return null;
    }
  });
}
