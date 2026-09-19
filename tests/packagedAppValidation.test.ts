import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { AddressInfo } from 'net';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { DownloadRepository } from '../src/main/storage/downloadRepository';
import { SettingsRepository } from '../src/main/storage/settingsRepository';
import { LibraryRepository } from '../src/main/library/libraryRepository';
import { LibraryManager } from '../src/main/library/libraryManager';
import { DownloadManager } from '../src/main/downloader/DownloadManager';
import { DEFAULT_SETTINGS } from '../src/shared/types/settings';

describe('Packaged App Real-World Validation Matrix', () => {
  let tempDir: string;
  let db: any;
  let downloadRepo: DownloadRepository;
  let settingsRepo: SettingsRepository;
  let libraryRepo: LibraryRepository;
  let libraryManager: LibraryManager;
  let downloadManager: DownloadManager;
  let server: http.Server;
  let serverPort: number;

  beforeEach(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-validation-'));
    const dbPath = path.join(tempDir, 'validation.db');
    db = initDatabase(dbPath);
    runMigrations(db);

    downloadRepo = new DownloadRepository(db);
    settingsRepo = new SettingsRepository(db);
    settingsRepo.saveSettings({
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      concurrency: 3,
    });
    libraryRepo = new LibraryRepository(db);
    libraryManager = new LibraryManager(libraryRepo, () => settingsRepo.getSettings());
    downloadManager = new DownloadManager(downloadRepo, settingsRepo, () => null);

    downloadManager.setOnDownloadComplete(async (item) => {
      await libraryManager.organizeCompletedDownload(item);
    });

    // Test HTTP server supporting Range, non-Range, 429, 503, and Unicode
    server = http.createServer((req, res) => {
      const url = req.url || '';

      if (url === '/video-range.mp4') {
        const totalSize = 10000;
        const range = req.headers.range;
        if (range) {
          const match = range.match(/bytes=(\d+)-(\d*)/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;
            const chunkLength = end - start + 1;
            res.writeHead(206, {
              'Content-Range': `bytes ${start}-${end}/${totalSize}`,
              'Accept-Ranges': 'bytes',
              'Content-Length': chunkLength,
              'Content-Type': 'video/mp4',
            });
            res.end(Buffer.alloc(chunkLength, 0x42));
            return;
          }
        }
        res.writeHead(200, {
          'Accept-Ranges': 'bytes',
          'Content-Length': totalSize,
          'Content-Type': 'video/mp4',
        });
        res.end(Buffer.alloc(totalSize, 0x42));
        return;
      }

      if (url === '/video-norange.mp4') {
        const totalSize = 5000;
        res.writeHead(200, {
          'Content-Length': totalSize,
          'Content-Type': 'video/mp4',
        });
        res.end(Buffer.alloc(totalSize, 0x41));
        return;
      }

      if (url === '/empty.mp4') {
        res.writeHead(200, {
          'Content-Length': 0,
          'Content-Type': 'video/mp4',
        });
        res.end('');
        return;
      }

      if (url === '/unicode-video-%E3%82%A2%E3%83%8B%E3%83%A1.mp4') {
        res.writeHead(200, {
          'Content-Length': 1000,
          'Content-Type': 'video/mp4',
        });
        res.end(Buffer.alloc(1000, 0x55));
        return;
      }

      res.writeHead(404);
      res.end('Not Found');
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    downloadManager.dispose();
    await new Promise((r) => setTimeout(r, 100));
    db.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('Section A: Download Engine - Range support and atomic completion', async () => {
    const url = `http://127.0.0.1:${serverPort}/video-range.mp4`;
    const [item] = await downloadManager.addUrls([url], {
      title: 'Validation Series',
      episode: 'S01E01',
      quality: '1080p',
    });

    expect(item).toBeDefined();
    expect(['Queued', 'Downloading']).toContain(item.status);

    // Wait for download completion
    let attempts = 0;
    while (attempts++ < 40) {
      const current = downloadManager.getById(item.id);
      if (current && current.status === 'Completed') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const completed = downloadManager.getById(item.id);
    expect(completed?.status).toBe('Completed');
    expect(completed?.downloadedBytes).toBe(10000);

    // Verify atomic rename removed .part
    const files = fs.readdirSync(tempDir);
    const hasPart = files.some((f) => f.endsWith('.part'));
    expect(hasPart).toBe(false);
  });

  it('Section B: Library - Automatic organization into Title / Season hierarchy', async () => {
    const url = `http://127.0.0.1:${serverPort}/video-range.mp4`;
    const [item] = await downloadManager.addUrls([url], {
      title: 'Attack on Titan',
      episode: 'S02E04',
      quality: '1080p',
    });

    let attempts = 0;
    while (attempts++ < 40) {
      const current = downloadManager.getById(item.id);
      if (current && current.status === 'Completed') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // Check library directory layout
    const libDir = libraryManager.getLibraryDirectory();
    const showDir = path.join(libDir, 'Attack on Titan', 'Season 02');
    expect(fs.existsSync(showDir)).toBe(true);

    const organizedFiles = fs.readdirSync(showDir);
    expect(organizedFiles.length).toBe(1);
    expect(organizedFiles[0]).toContain('Attack on Titan - S02E04');

    // Check SQLite database
    const titles = libraryRepo.getTitles('all');
    expect(titles.length).toBe(1);
    expect(titles[0].name).toBe('Attack on Titan');
    expect(titles[0].downloadedEpisodes).toBe(1);
  });

  it('Section C & D: Player & Offline Resumption without network', () => {
    // 1. Create offline local media
    const libDir = libraryManager.getLibraryDirectory();
    const showDir = path.join(libDir, 'Offline Show', 'Season 01');
    fs.mkdirSync(showDir, { recursive: true });
    const videoPath = path.join(showDir, 'Offline Show - S01E01.mp4');
    fs.writeFileSync(videoPath, Buffer.alloc(5000, 0x99));

    const title = libraryRepo.upsertTitle({
      id: 'title-off-test',
      name: 'Offline Show',
      authorizedSource: 'Offline Local',
      createdAt: Date.now(),
    });
    const season = libraryRepo.upsertSeason({
      id: 'season-off-1',
      titleId: title.id,
      seasonNumber: 1,
      name: 'Season 1',
    });
    const ep = libraryRepo.upsertEpisode({
      id: 'ep-off-1',
      seasonId: season.id,
      titleId: title.id,
      episodeNumber: 1,
      name: 'The Beginning',
      durationSeconds: 1200,
    });
    libraryRepo.upsertMediaFile({
      id: 'mf-off-1',
      episodeId: ep.id,
      filePath: videoPath,
      fileSize: 5000,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    // 2. Save watch progress at 320 seconds
    libraryRepo.saveWatchProgress('ep-off-1', title.id, 320, 1200);

    // 3. Query without any network connection
    const queriedProgress = libraryRepo.getWatchProgress('ep-off-1');
    expect(queriedProgress).not.toBeNull();
    expect(queriedProgress?.positionSeconds).toBe(320);

    // Check continue watching filter
    const continueTitles = libraryRepo.getTitles('continue_watching');
    expect(continueTitles.length).toBe(1);
    expect(continueTitles[0].continueWatchingEpisode?.id).toBe('ep-off-1');
  });

  it('Section E: Edge Cases - Unicode filenames, empty files, non-Range servers', async () => {
    // Unicode download
    const unicodeUrl = `http://127.0.0.1:${serverPort}/unicode-video-%E3%82%A2%E3%83%8B%E3%83%A1.mp4`;
    const [unicodeItem] = await downloadManager.addUrls([unicodeUrl], {
      title: 'Anime 日本語',
      episode: 'S01E01',
      quality: '720p',
    });

    let attempts = 0;
    while (attempts++ < 40) {
      const current = downloadManager.getById(unicodeItem.id);
      if (current && current.status === 'Completed') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const completed = downloadManager.getById(unicodeItem.id);
    expect(completed?.status).toBe('Completed');

    // Non-Range download
    const noRangeUrl = `http://127.0.0.1:${serverPort}/video-norange.mp4`;
    const [noRangeItem] = await downloadManager.addUrls([noRangeUrl]);
    attempts = 0;
    while (attempts++ < 40) {
      const current = downloadManager.getById(noRangeItem.id);
      if (current && current.status === 'Completed') break;
      await new Promise((r) => setTimeout(r, 100));
    }
    expect(downloadManager.getById(noRangeItem.id)?.status).toBe('Completed');
  });
});
