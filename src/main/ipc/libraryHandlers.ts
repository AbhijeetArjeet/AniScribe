import { ipcMain } from 'electron';
import fs from 'fs';
import path from 'path';
import { LibraryRepository } from '../library/libraryRepository';
import { LibraryManager } from '../library/libraryManager';
import { LibraryFilter } from '../../shared/types/library';

export function registerLibraryHandlers(
  libraryRepository: LibraryRepository,
  libraryManager: LibraryManager
): void {
  ipcMain.handle('library:getTitles', (_event, filter?: unknown, search?: unknown) => {
    const validFilter = typeof filter === 'string' ? (filter as LibraryFilter) : undefined;
    const validSearch = typeof search === 'string' ? search : undefined;
    return libraryRepository.getAllTitles(validFilter, validSearch);
  });

  ipcMain.handle('library:getTitle', (_event, id: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return null;
    return libraryRepository.getTitle(id.trim());
  });

  ipcMain.handle('library:deleteTitle', (_event, id: unknown, deleteFiles?: unknown) => {
    if (typeof id !== 'string' || !id.trim()) return false;
    const title = libraryRepository.getTitle(id.trim());
    if (!title) return false;

    if (deleteFiles) {
      try {
        const libRoot = libraryManager.getLibraryDirectory();
        const safeTitleFolder = title.name.replace(/[\\/:*?"<>|]/g, '_').trim();
        const targetDir = path.join(libRoot, safeTitleFolder);
        if (fs.existsSync(targetDir)) {
          fs.rmSync(targetDir, { recursive: true, force: true });
        }
      } catch (err) {
        console.warn('[Library] Could not delete disk folder for title:', err);
      }
    }

    libraryRepository.deleteTitle(id.trim());
    return true;
  });

  ipcMain.handle('library:deleteMediaFile', (_event, mediaFileId: unknown, deleteDiskFile?: unknown) => {
    if (typeof mediaFileId !== 'string' || !mediaFileId.trim()) return false;
    return libraryRepository.deleteMediaFile(mediaFileId.trim(), Boolean(deleteDiskFile));
  });

  ipcMain.handle('library:scan', () => {
    return libraryManager.scanLibrary();
  });
}
