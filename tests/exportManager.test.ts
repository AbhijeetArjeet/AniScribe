import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { LibraryRepository } from '../src/main/library/libraryRepository';
import { ExportManager } from '../src/main/export/exportManager';

describe('ExportManager Mobile / Tablet & USB Export Subsystem', () => {
  let tempDir: string;
  let sourceDir: string;
  let exportDir: string;
  let db: any;
  let libraryRepo: LibraryRepository;
  let exportManager: ExportManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-export-test-'));
    sourceDir = path.join(tempDir, 'source');
    exportDir = path.join(tempDir, 'export');
    fs.mkdirSync(sourceDir, { recursive: true });
    fs.mkdirSync(exportDir, { recursive: true });

    const dbPath = path.join(tempDir, 'test.db');
    db = initDatabase(dbPath);
    runMigrations(db);

    libraryRepo = new LibraryRepository(db);
    exportManager = new ExportManager(libraryRepo, db);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should export a single episode as a normal playable video file without modifying source', async () => {
    // 1. Create a real video file in source
    const sourceVideo = path.join(sourceDir, 'One Piece - S01E01 [1080p].mp4');
    fs.writeFileSync(sourceVideo, Buffer.alloc(10000, 0x33));

    // 2. Register in SQLite
    const title = libraryRepo.upsertTitle({
      id: 't-one-piece',
      name: 'One Piece',
      authorizedSource: 'Test',
    });
    const season = libraryRepo.upsertSeason({
      id: 's-op-1',
      titleId: title.id,
      seasonNumber: 1,
      name: 'East Blue',
    });
    const ep = libraryRepo.upsertEpisode({
      id: 'ep-op-1',
      seasonId: season.id,
      titleId: title.id,
      episodeNumber: 1,
      name: "I'm Luffy!",
    });
    const media = libraryRepo.upsertMediaFile({
      id: 'media-op-1',
      episodeId: ep.id,
      filePath: sourceVideo,
      fileSize: 10000,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    // 3. Trigger export to exportDir
    const job = await exportManager.startExport({
      mediaFileIds: [media.id],
      destinationDir: exportDir,
      createMobileFolders: true,
      collisionResolution: 'rename',
      isMove: false,
    });

    expect(job).toBeDefined();
    expect(job.items.length).toBe(1);

    // Wait for export stream pipeline to complete
    let attempts = 0;
    while (attempts++ < 30) {
      const current = exportManager.getJob(job.id);
      if (current && (current.status === 'Completed' || current.status === 'Failed')) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const completed = exportManager.getJob(job.id);
    expect(completed?.status).toBe('Completed');
    expect(completed?.overallPercentage).toBe(100);

    // 4. Verify exported file exists in mobile structured folders
    const expectedExportPath = path.join(exportDir, 'One Piece', 'Season 01', 'One Piece - S01E01 [1080p].mp4');
    expect(fs.existsSync(expectedExportPath)).toBe(true);
    expect(fs.statSync(expectedExportPath).size).toBe(10000);

    // 5. Verify non-destructive guarantee: source file is completely intact!
    expect(fs.existsSync(sourceVideo)).toBe(true);
    expect(fs.statSync(sourceVideo).size).toBe(10000);
  });

  it('should handle filename collisions using automatic renaming', async () => {
    const sourceVideo = path.join(sourceDir, 'sample.mp4');
    fs.writeFileSync(sourceVideo, Buffer.alloc(2000, 0x44));

    // Pre-create an existing file at destination
    const existingTarget = path.join(exportDir, 'sample.mp4');
    fs.writeFileSync(existingTarget, 'already exists');

    // We need title, season, and episode in DB first for foreign key integrity
    libraryRepo.upsertTitle({ id: 't-col', name: 'Collision Test', authorizedSource: 'T' });
    libraryRepo.upsertSeason({ id: 's-col', titleId: 't-col', seasonNumber: 1, name: 'S1' });
    libraryRepo.upsertEpisode({ id: 'ep-dummy', seasonId: 's-col', titleId: 't-col', episodeNumber: 1, name: 'E1' });

    const media = libraryRepo.upsertMediaFile({
      id: 'm-col-1',
      episodeId: 'ep-dummy',
      filePath: sourceVideo,
      fileSize: 2000,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    const job = await exportManager.startExport({
      mediaFileIds: [media.id],
      destinationDir: exportDir,
      createMobileFolders: false, // flat export
      collisionResolution: 'rename',
    });

    let attempts = 0;
    while (attempts++ < 30) {
      const current = exportManager.getJob(job.id);
      if (current && current.status === 'Completed') break;
      await new Promise((r) => setTimeout(r, 100));
    }

    // Should create "sample (1).mp4" and leave "sample.mp4" untouched
    const renamedTarget = path.join(exportDir, 'sample (1).mp4');
    expect(fs.existsSync(renamedTarget)).toBe(true);
    expect(fs.statSync(renamedTarget).size).toBe(2000);
    expect(fs.readFileSync(existingTarget, 'utf8')).toBe('already exists');
  });

  it('should support export cancellation and clean up partial export files', async () => {
    // Create large source file
    const largeSource = path.join(sourceDir, 'large.mp4');
    fs.writeFileSync(largeSource, Buffer.alloc(500000, 0x11));

    libraryRepo.upsertTitle({ id: 't-cancel', name: 'Cancel Test', authorizedSource: 'T' });
    libraryRepo.upsertSeason({ id: 's-cancel', titleId: 't-cancel', seasonNumber: 1, name: 'S1' });
    libraryRepo.upsertEpisode({ id: 'ep-cancel', seasonId: 's-cancel', titleId: 't-cancel', episodeNumber: 1, name: 'E1' });
    const media = libraryRepo.upsertMediaFile({
      id: 'm-cancel',
      episodeId: 'ep-cancel',
      filePath: largeSource,
      fileSize: 500000,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    const job = await exportManager.startExport({
      mediaFileIds: [media.id],
      destinationDir: exportDir,
      createMobileFolders: false,
    });

    // Cancel immediately
    const cancelled = exportManager.cancelExport(job.id);
    expect(cancelled).toBe(true);

    const updated = exportManager.getJob(job.id);
    expect(updated?.status).toBe('Cancelled');

    // Verify partial files are cleaned up
    const files = fs.readdirSync(exportDir);
    const hasPartial = files.some((f) => f.endsWith('.bfexport'));
    expect(hasPartial).toBe(false);
  });
});
