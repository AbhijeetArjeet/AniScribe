import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { LibraryRepository } from '../src/main/library/libraryRepository';
import { LibraryManager } from '../src/main/library/libraryManager';
import { DownloadItem } from '../src/shared/types/download';
import { AppSettings, DEFAULT_SETTINGS } from '../src/shared/types/settings';

describe('LibraryManager Automatic File Organization & Disk Scanning', () => {
  let tempDir: string;
  let tempDbPath: string;
  let db: any;
  let repo: LibraryRepository;
  let manager: LibraryManager;
  let libraryUpdatedCount = 0;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-organizer-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
    db = initDatabase(tempDbPath);
    runMigrations(db);
    repo = new LibraryRepository(db);

    libraryUpdatedCount = 0;
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
    };

    manager = new LibraryManager(repo, () => settings, () => {
      libraryUpdatedCount++;
    });
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should automatically organize completed download into library folders and register database records', async () => {
    // 1. Create a dummy downloaded media file
    const dlFolder = path.join(tempDir, 'downloads');
    fs.mkdirSync(dlFolder, { recursive: true });
    const dummyFile = path.join(dlFolder, 'raw_dl_1.mp4');
    fs.writeFileSync(dummyFile, 'fake mp4 video bytes 12345');

    const downloadItem: DownloadItem = {
      id: 'task-cyberpunk-1',
      url: 'https://example.com/stream/ep1.mp4',
      filename: 'raw_dl_1.mp4',
      hostname: 'example.com',
      destination: dlFolder,
      totalSize: 26,
      downloadedBytes: 26,
      percentage: 100,
      speed: 0,
      eta: 0,
      status: 'Completed',
      title: 'Cyberpunk Edgerunners',
      episode: 'S01E01',
      quality: '1080p',
      createdAt: Date.now(),
      queueOrder: 0,
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
    };

    // 2. Organize download
    const targetPath = await manager.organizeCompletedDownload(downloadItem);
    expect(targetPath).not.toBeNull();
    expect(fs.existsSync(targetPath!)).toBe(true);
    expect(fs.existsSync(dummyFile)).toBe(false); // moved from source
    expect(targetPath).toContain('Cyberpunk Edgerunners');
    expect(targetPath).toContain('Season 01');
    expect(targetPath).toContain('S01E01');
    expect(libraryUpdatedCount).toBe(1);

    // 3. Verify SQLite records
    const titles = repo.getTitles('all');
    expect(titles.length).toBe(1);
    expect(titles[0].name).toBe('Cyberpunk Edgerunners');
    expect(titles[0].seasons.length).toBe(1);

    const s1 = titles[0].seasons[0];
    expect(s1.seasonNumber).toBe(1);
    expect(s1.episodes.length).toBe(1);

    const ep1 = s1.episodes[0];
    expect(ep1.episodeNumber).toBe(1);
    expect(ep1.isDownloaded).toBe(true);
    expect(ep1.mediaFile).toBeDefined();
    expect(ep1.mediaFile!.filePath).toBe(targetPath);
  });

  it('should scan library folder and index externally placed files', async () => {
    // 1. Manually create file structure in Library/
    const libDir = manager.getLibraryDirectory();
    const showDir = path.join(libDir, 'Frieren Beyond Journeys End', 'Season 01');
    fs.mkdirSync(showDir, { recursive: true });

    const ep1File = path.join(showDir, 'Frieren - S01E01 [1080p].mkv');
    const ep2File = path.join(showDir, 'Frieren - S01E02 [1080p].mkv');
    fs.writeFileSync(ep1File, 'dummy video 1');
    fs.writeFileSync(ep2File, 'dummy video 2');

    // 2. Run scan
    const indexedCount = await manager.scanLibraryFolder();
    expect(indexedCount).toBe(2);

    // 3. Check DB
    const titles = repo.getTitles('all');
    expect(titles.length).toBe(1);
    expect(titles[0].name).toContain('Frieren');
    expect(titles[0].seasons[0].episodes.length).toBe(2);
  });
});
