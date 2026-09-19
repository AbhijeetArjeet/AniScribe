import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/main/storage/migrations';
import { LibraryRepository } from '../src/main/library/libraryRepository';
import { SubtitleGenerator } from '../src/main/ai/subtitleGenerator';

describe('AI Subtitle Generator & Live Translation (RTX 2050 / Low-Resource)', () => {
  let tempDir: string;
  let db: Database.Database;
  let libraryRepo: LibraryRepository;
  let subtitleGen: SubtitleGenerator;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-ai-test-'));
    const dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);
    runMigrations(db);
    libraryRepo = new LibraryRepository(db);
    subtitleGen = new SubtitleGenerator(libraryRepo, tempDir);
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should initialize with low-resource RTX 2050 profile and persist configuration updates', () => {
    const config = subtitleGen.getConfig();
    expect(config.profile).toBe('balanced_rtx2050');
    expect(config.sourceLanguage).toBe('ja');
    expect(config.targetLanguage).toBe('en');

    // Update to ultra_light
    const updated = subtitleGen.updateConfig({
      profile: 'ultra_light',
      provider: 'groq',
      apiKey: 'gsk_test_key_123',
    });

    expect(updated.profile).toBe('ultra_light');
    expect(updated.provider).toBe('groq');
    expect(updated.apiKey).toBe('gsk_test_key_123');

    // New instance loads persisted configuration
    const loadedGen = new SubtitleGenerator(libraryRepo, tempDir);
    expect(loadedGen.getConfig().profile).toBe('ultra_light');
    expect(loadedGen.getConfig().apiKey).toBe('gsk_test_key_123');
  });

  it('should generate English .srt subtitles for an episode and save right next to video file', async () => {
    // 1. Create a dummy media file on disk
    const videoPath = path.join(tempDir, 'Attack on Titan - S01E01 [1080p].mp4');
    fs.writeFileSync(videoPath, 'fake-mp4-stream');

    // 2. Insert Title -> Season -> Episode -> MediaFile in SQLite
    const now = Date.now();
    db.prepare(`
      INSERT INTO titles (id, name, authorized_source, created_at)
      VALUES (?, ?, ?, ?)
    `).run('title-aot', 'Attack on Titan', 'authorized-api', now);

    db.prepare(`
      INSERT INTO seasons (id, title_id, season_number, name)
      VALUES (?, ?, ?, ?)
    `).run('season-aot-1', 'title-aot', 1, 'Season 1');

    db.prepare(`
      INSERT INTO episodes (id, season_id, title_id, episode_number, name)
      VALUES (?, ?, ?, ?, ?)
    `).run('ep-aot-1', 'season-aot-1', 'title-aot', 1, 'To You, in 2000 Years');

    db.prepare(`
      INSERT INTO media_files (id, episode_id, file_path, file_size, format, resolution, download_date)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('mf-aot-1', 'ep-aot-1', videoPath, 1024, 'mp4', '1080p', now);

    // 3. Generate subtitles
    const result = await subtitleGen.generateSubtitlesForEpisode('ep-aot-1');
    expect(result.success).toBe(true);
    expect(result.srtPath).toBeDefined();

    const expectedSrt = path.join(tempDir, 'Attack on Titan - S01E01 [1080p].en.srt');
    expect(result.srtPath).toBe(expectedSrt);
    expect(fs.existsSync(expectedSrt)).toBe(true);

    const srtContent = fs.readFileSync(expectedSrt, 'utf8');
    expect(srtContent).toContain("Don't give up!");
    expect(srtContent).toContain('Tanjiro-kun');
    expect(srtContent).toMatch(/00:00:01,\d+ --> 00:00:05,\d+/);
  });

  it('should process batch subtitle generation for an entire season', async () => {
    // Create 2 test episodes
    const video1 = path.join(tempDir, 'Jujutsu Kaisen - S01E01 [1080p].mp4');
    const video2 = path.join(tempDir, 'Jujutsu Kaisen - S01E02 [1080p].mp4');
    fs.writeFileSync(video1, 'video1');
    fs.writeFileSync(video2, 'video2');

    const now = Date.now();
    db.prepare(`INSERT INTO titles (id, name, authorized_source, created_at) VALUES (?, ?, ?, ?)`).run('title-jjk', 'Jujutsu Kaisen', 'authorized-api', now);
    db.prepare(`INSERT INTO seasons (id, title_id, season_number, name) VALUES (?, ?, ?, ?)`).run('season-jjk-1', 'title-jjk', 1, 'Season 1');
    db.prepare(`INSERT INTO episodes (id, season_id, title_id, episode_number, name) VALUES (?, ?, ?, ?, ?)`).run('ep-jjk-1', 'season-jjk-1', 'title-jjk', 1, 'Ryomen Sukuna');
    db.prepare(`INSERT INTO episodes (id, season_id, title_id, episode_number, name) VALUES (?, ?, ?, ?, ?)`).run('ep-jjk-2', 'season-jjk-1', 'title-jjk', 2, 'For Myself');
    db.prepare(`INSERT INTO media_files (id, episode_id, file_path, file_size, format, resolution, download_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('mf-1', 'ep-jjk-1', video1, 100, 'mp4', '1080p', now);
    db.prepare(`INSERT INTO media_files (id, episode_id, file_path, file_size, format, resolution, download_date) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('mf-2', 'ep-jjk-2', video2, 100, 'mp4', '1080p', now);

    const job = await subtitleGen.queueBatchSeason('title-jjk', 1);
    expect(job.totalEpisodes).toBe(2);
    expect(['pending', 'processing']).toContain(job.status);

    // Wait for queue loop to complete processing (2 episodes * ~1000ms)
    await new Promise((r) => setTimeout(r, 2600));

    const updatedJob = subtitleGen.getBatchJob(job.id);
    expect(updatedJob).toBeDefined();
    expect(updatedJob!.completedEpisodes).toBe(2);
    expect(updatedJob!.status).toBe('completed');

    expect(fs.existsSync(path.join(tempDir, 'Jujutsu Kaisen - S01E01 [1080p].en.srt'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'Jujutsu Kaisen - S01E02 [1080p].en.srt'))).toBe(true);
  });

  it('should translate live audio slices with Japanese dialogue simulation/recognition', async () => {
    const liveResult = await subtitleGen.translateLiveAudioSlice();
    expect(liveResult.text).toBeDefined();
    expect(liveResult.text.length).toBeGreaterThan(0);
    expect(liveResult.timestamp).toBeGreaterThan(0);
  });
});
