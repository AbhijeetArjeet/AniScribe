import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { SettingsRepository } from '../src/main/storage/settingsRepository';
import { LibraryRepository } from '../src/main/library/libraryRepository';
import { StorageManager } from '../src/main/storage/storageManager';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';

describe('StorageManager Disk Analytics, Cleanup & Library Migration', () => {
  let tempDir: string;
  let newLocationDir: string;
  let db: any;
  let settingsRepo: SettingsRepository;
  let libraryRepo: LibraryRepository;
  let storageManager: StorageManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-storage-test-'));
    newLocationDir = path.join(tempDir, 'NewLibraryLocation');
    fs.mkdirSync(newLocationDir, { recursive: true });

    const dbPath = path.join(tempDir, 'test.db');
    db = initDatabase(dbPath);
    runMigrations(db);

    settingsRepo = new SettingsRepository(db);
    settingsRepo.saveSettings({
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
    });
    libraryRepo = new LibraryRepository(db);
    storageManager = new StorageManager(db, settingsRepo, libraryRepo);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should compute accurate storage metrics and title breakdowns', async () => {
    // 1. Create a dummy library file
    const libDir = storageManager.getLibraryPath();
    const showDir = path.join(libDir, 'Chainsaw Man', 'Season 01');
    fs.mkdirSync(showDir, { recursive: true });
    const videoFile = path.join(showDir, 'Chainsaw Man - S01E01.mp4');
    fs.writeFileSync(videoFile, Buffer.alloc(15000, 0x88));

    const title = libraryRepo.upsertTitle({
      id: 't-csm',
      name: 'Chainsaw Man',
      authorizedSource: 'Test',
    });
    const season = libraryRepo.upsertSeason({
      id: 's-csm-1',
      titleId: title.id,
      seasonNumber: 1,
      name: 'Season 1',
    });
    const ep = libraryRepo.upsertEpisode({
      id: 'ep-csm-1',
      seasonId: season.id,
      titleId: title.id,
      episodeNumber: 1,
      name: 'Dog & Chainsaw',
    });
    libraryRepo.upsertMediaFile({
      id: 'm-csm-1',
      episodeId: ep.id,
      filePath: videoFile,
      fileSize: 15000,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    const overview = await storageManager.getStorageOverview();
    expect(overview.totalTitles).toBe(1);
    expect(overview.totalMediaFiles).toBe(1);
    expect(overview.totalLibrarySizeBytes).toBe(15000);
    expect(overview.titleBreakdowns.length).toBe(1);
    expect(overview.titleBreakdowns[0].titleName).toBe('Chainsaw Man');
    expect(overview.largestFiles.length).toBe(1);
    expect(overview.largestFiles[0].fileSizeBytes).toBe(15000);
  });

  it('should delete watched episode media files while keeping watch history records intact', async () => {
    const libDir = storageManager.getLibraryPath();
    const videoWatched = path.join(libDir, 'watched.mp4');
    const videoUnwatched = path.join(libDir, 'unwatched.mp4');
    fs.writeFileSync(videoWatched, 'watched data');
    fs.writeFileSync(videoUnwatched, 'unwatched data');

    const title = libraryRepo.upsertTitle({ id: 't-watch-del', name: 'Show', authorizedSource: 'T' });
    const season = libraryRepo.upsertSeason({ id: 's-wd-1', titleId: title.id, seasonNumber: 1, name: 'S1' });

    // Episode 1 (Watched)
    const ep1 = libraryRepo.upsertEpisode({ id: 'ep-w1', seasonId: season.id, titleId: title.id, episodeNumber: 1, name: 'E1' });
    libraryRepo.upsertMediaFile({ id: 'm-w1', episodeId: ep1.id, filePath: videoWatched, fileSize: 12, format: 'mp4', downloadDate: Date.now(), verified: true });
    libraryRepo.markEpisodeWatched('ep-w1', title.id, true);

    // Episode 2 (Unwatched)
    const ep2 = libraryRepo.upsertEpisode({ id: 'ep-w2', seasonId: season.id, titleId: title.id, episodeNumber: 2, name: 'E2' });
    libraryRepo.upsertMediaFile({ id: 'm-w2', episodeId: ep2.id, filePath: videoUnwatched, fileSize: 14, format: 'mp4', downloadDate: Date.now(), verified: true });

    // Clean watched
    const deletedCount = await storageManager.deleteWatchedEpisodes();
    expect(deletedCount).toBe(1);

    // Watched file removed from disk
    expect(fs.existsSync(videoWatched)).toBe(false);
    // Unwatched file remains intact
    expect(fs.existsSync(videoUnwatched)).toBe(true);

    // Watch progress history still exists
    const progress = libraryRepo.getWatchProgress('ep-w1');
    expect(progress?.isCompleted).toBe(true);
  });

  it('should migrate library location safely, verify files, and update SQLite paths', async () => {
    const libDir = storageManager.getLibraryPath();
    const oldFile = path.join(libDir, 'Show C', 'Season 01', 'Show C - S01E01.mp4');
    fs.mkdirSync(path.dirname(oldFile), { recursive: true });
    fs.writeFileSync(oldFile, Buffer.alloc(8000, 0x55));

    const title = libraryRepo.upsertTitle({ id: 't-mig', name: 'Show C', authorizedSource: 'T' });
    const season = libraryRepo.upsertSeason({ id: 's-mig-1', titleId: title.id, seasonNumber: 1, name: 'S1' });
    const ep = libraryRepo.upsertEpisode({ id: 'ep-mig-1', seasonId: season.id, titleId: title.id, episodeNumber: 1, name: 'E1' });
    const media = libraryRepo.upsertMediaFile({
      id: 'm-mig-1',
      episodeId: ep.id,
      filePath: oldFile,
      fileSize: 8000,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    const result = await storageManager.migrateLibraryLocation(newLocationDir, true);
    expect(result.success).toBe(true);
    expect(result.movedCount).toBe(1);

    // File in new location
    const expectedNewFile = path.join(newLocationDir, 'Library', 'Show C', 'Season 01', 'Show C - S01E01.mp4');
    expect(fs.existsSync(expectedNewFile)).toBe(true);
    expect(fs.statSync(expectedNewFile).size).toBe(8000);

    // Old file removed since moveFiles = true
    expect(fs.existsSync(oldFile)).toBe(false);

    // SQLite path updated
    const updatedMedia = libraryRepo.getMediaFileByEpisodeId('ep-mig-1');
    expect(updatedMedia?.filePath).toBe(expectedNewFile);

    // Settings download directory updated
    expect(settingsRepo.getSettings().downloadDirectory).toBe(newLocationDir);
  });
});
