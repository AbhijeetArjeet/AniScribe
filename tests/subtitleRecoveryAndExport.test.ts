import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/main/storage/migrations';
import { LibraryRepository } from '../src/main/library/libraryRepository';
import { SubtitleGenerator } from '../src/main/ai/subtitleGenerator';
import { ExportManager } from '../src/main/export/exportManager';

describe('Batch Subtitle SQLite Persistence, Restart Recovery & Mobile Subtitle Export', () => {
  let tempDir: string;
  let db: Database.Database;
  let libraryRepo: LibraryRepository;
  let subtitleGen: SubtitleGenerator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-recovery-test-'));
    const dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);
    runMigrations(db);
    libraryRepo = new LibraryRepository(db);
    subtitleGen = new SubtitleGenerator(libraryRepo, tempDir, db);
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should persist batch subtitle tasks in SQLite and recover unfinished jobs on application restart', async () => {
    // 1. Create 2 test episodes
    const video1 = path.join(tempDir, 'Steins Gate - S01E01 [1080p].mp4');
    const video2 = path.join(tempDir, 'Steins Gate - S01E02 [1080p].mp4');
    fs.writeFileSync(video1, 'vid1');
    fs.writeFileSync(video2, 'vid2');

    const now = Date.now();
    db.prepare(`INSERT INTO titles (id, name, authorized_source, created_at) VALUES (?, ?, ?, ?)`).run('title-sg', 'Steins Gate', 'api', now);
    db.prepare(`INSERT INTO seasons (id, title_id, season_number, name) VALUES (?, ?, ?, ?)`).run('season-sg-1', 'title-sg', 1, 'Season 1');
    db.prepare(`INSERT INTO episodes (id, season_id, title_id, episode_number, name) VALUES (?, ?, ?, ?, ?)`).run('ep-sg-1', 'season-sg-1', 'title-sg', 1, 'Prologue');
    db.prepare(`INSERT INTO episodes (id, season_id, title_id, episode_number, name) VALUES (?, ?, ?, ?, ?)`).run('ep-sg-2', 'season-sg-1', 'title-sg', 2, 'Time Travel');
    db.prepare(`INSERT INTO media_files (id, episode_id, file_path, file_size, format, resolution, download_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('mf-sg-1', 'ep-sg-1', video1, 100, 'mp4', '1080p', now);
    db.prepare(`INSERT INTO media_files (id, episode_id, file_path, file_size, format, resolution, download_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('mf-sg-2', 'ep-sg-2', video2, 100, 'mp4', '1080p', now);

    // 2. Queue batch season
    const job = await subtitleGen.queueBatchSeason('title-sg', 1);
    expect(job.totalEpisodes).toBe(2);

    // Verify SQLite records exist
    const rows = db.prepare('SELECT * FROM ai_subtitle_jobs WHERE title_id = ?').all('title-sg') as any[];
    expect(rows.length).toBe(2);
    expect(rows[0].season_number).toBe(1);

    // 3. Mark episode 1 completed and simulate an application restart while episode 2 is queued
    db.prepare(`UPDATE ai_subtitle_jobs SET status = 'Completed' WHERE episode_id = 'ep-sg-1'`).run();
    db.prepare(`UPDATE ai_subtitle_jobs SET status = 'Queued' WHERE episode_id = 'ep-sg-2'`).run();

    // 4. Create fresh SubtitleGenerator simulating new app launch
    const restartedGen = new SubtitleGenerator(libraryRepo, tempDir, db);
    const recoveredJobs = restartedGen.getAllBatchJobs();

    expect(recoveredJobs.length).toBe(1);
    expect(recoveredJobs[0].titleId).toBe('title-sg');
    expect(recoveredJobs[0].completedEpisodes).toBe(1); // Didn't restart episode 1!
    expect(recoveredJobs[0].episodeIds).toContain('ep-sg-2');
  });

  it('should export video file along with matching .en.srt subtitle files to mobile destinations', async () => {
    // 1. Create video file and matching .en.srt file
    const videoFile = path.join(tempDir, 'Chainsaw Man - S01E01 [1080p].mp4');
    const subFile = path.join(tempDir, 'Chainsaw Man - S01E01 [1080p].en.srt');
    fs.writeFileSync(videoFile, 'sample-chainsaw-video-stream');
    fs.writeFileSync(subFile, '1\n00:00:01,000 --> 00:00:04,000\nRip and tear!');

    const now = Date.now();
    db.prepare(`INSERT INTO titles (id, name, authorized_source, created_at) VALUES (?, ?, ?, ?)`).run('title-csm', 'Chainsaw Man', 'api', now);
    db.prepare(`INSERT INTO seasons (id, title_id, season_number, name) VALUES (?, ?, ?, ?)`).run('season-csm-1', 'title-csm', 1, 'Season 1');
    db.prepare(`INSERT INTO episodes (id, season_id, title_id, episode_number, name) VALUES (?, ?, ?, ?, ?)`).run('ep-csm-1', 'season-csm-1', 'title-csm', 1, 'Dog & Chainsaw');
    db.prepare(`INSERT INTO media_files (id, episode_id, file_path, file_size, format, resolution, download_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('mf-csm-1', 'ep-csm-1', videoFile, 1024, 'mp4', '1080p', now);

    // 2. Export with includeSubtitles = true to target USB/mobile directory
    const destDir = path.join(tempDir, 'Mobile_USB_Export');
    fs.mkdirSync(destDir, { recursive: true });

    const exportManager = new ExportManager(libraryRepo, db);
    const exportJob = await exportManager.startExport({
      mediaFileIds: ['mf-csm-1'],
      destinationDir: destDir,
      createMobileFolders: true,
      includeSubtitles: true,
    });

    // Wait for export copy to complete
    await new Promise((r) => setTimeout(r, 600));

    // Verify video and subtitle file exist together in destination
    const expectedExportFolder = path.join(destDir, 'Chainsaw Man', 'Season 01');
    const expectedVideo = path.join(expectedExportFolder, 'Chainsaw Man - S01E01 [1080p].mp4');
    const expectedSub = path.join(expectedExportFolder, 'Chainsaw Man - S01E01 [1080p].en.srt');

    expect(fs.existsSync(expectedVideo)).toBe(true);
    expect(fs.existsSync(expectedSub)).toBe(true);

    const exportedSubContent = fs.readFileSync(expectedSub, 'utf8');
    expect(exportedSubContent).toContain('Rip and tear!');
  });
});
