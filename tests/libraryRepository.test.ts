import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { LibraryRepository } from '../src/main/library/libraryRepository';

describe('Media Library Repository & SQLite Persistence', () => {
  let tempDir: string;
  let tempDbPath: string;
  let db: any;
  let repo: LibraryRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-lib-repo-'));
    tempDbPath = path.join(tempDir, 'test.db');
    db = initDatabase(tempDbPath);
    runMigrations(db);
    repo = new LibraryRepository(db);
  });

  afterEach(() => {
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should create Title -> Season -> Episode -> MediaFile hierarchy and query it', () => {
    // 1. Create Title
    const title = repo.upsertTitle({
      id: 'title-steins-gate',
      name: 'Steins;Gate',
      originalName: 'シュタインズ・ゲート',
      description: 'A sci-fi thriller about time travel and causality.',
      posterPath: 'https://example.com/poster.jpg',
      authorizedSource: 'AuthorizedArchive',
    });
    expect(title.id).toBe('title-steins-gate');
    expect(title.name).toBe('Steins;Gate');

    // 2. Create Season
    const season = repo.upsertSeason({
      id: 'season-sg-1',
      titleId: title.id,
      seasonNumber: 1,
      name: 'Season 1',
      episodeCount: 24,
    });
    expect(season.seasonNumber).toBe(1);

    // 3. Create Episodes
    const ep1 = repo.upsertEpisode({
      id: 'ep-sg-1',
      seasonId: season.id,
      titleId: title.id,
      episodeNumber: 1,
      name: 'Turning Point',
      durationSeconds: 1440,
    });

    const ep2 = repo.upsertEpisode({
      id: 'ep-sg-2',
      seasonId: season.id,
      titleId: title.id,
      episodeNumber: 2,
      name: 'Time Travel Paranoia',
      durationSeconds: 1440,
    });

    // 4. Attach MediaFile to Episode 1
    const realVideo = path.join(tempDir, 'Episode 01 - Turning Point.mp4');
    fs.writeFileSync(realVideo, 'dummy video bytes');

    const media = repo.upsertMediaFile({
      id: 'media-sg-1',
      episodeId: ep1.id,
      filePath: realVideo,
      fileSize: 350000000,
      format: 'mp4',
      resolution: '1080p',
      downloadDate: Date.now(),
      verified: true,
    });
    expect(media.format).toBe('mp4');

    // 5. Query complete hierarchy
    const fullTitle = repo.getTitle('title-steins-gate');
    expect(fullTitle).not.toBeNull();
    expect(fullTitle!.name).toBe('Steins;Gate');
    expect(fullTitle!.seasons.length).toBe(1);
    expect(fullTitle!.seasons[0].episodes.length).toBe(2);

    const fetchedEp1 = fullTitle!.seasons[0].episodes.find((e) => e.id === 'ep-sg-1')!;
    expect(fetchedEp1.isDownloaded).toBe(true);
    expect(fetchedEp1.mediaFile).toBeDefined();
    expect(fetchedEp1.mediaFile!.resolution).toBe('1080p');

    const fetchedEp2 = fullTitle!.seasons[0].episodes.find((e) => e.id === 'ep-sg-2')!;
    expect(fetchedEp2.isDownloaded).toBe(false);
    expect(fetchedEp2.mediaFile).toBeUndefined();
  });

  it('should track watch progress and update resume state', () => {
    repo.upsertTitle({
      id: 'title-eva',
      name: 'Neon Genesis Evangelion',
      authorizedSource: 'Test',
    });
    repo.upsertSeason({
      id: 'season-eva-1',
      titleId: 'title-eva',
      seasonNumber: 1,
      name: 'Season 1',
    });
    repo.upsertEpisode({
      id: 'ep-eva-1',
      seasonId: 'season-eva-1',
      titleId: 'title-eva',
      episodeNumber: 1,
      name: 'Angel Attack',
      durationSeconds: 1420,
    });

    // Save partial progress
    repo.saveWatchProgress('ep-eva-1', 'title-eva', 450, 1420);

    let prog = repo.getWatchProgress('ep-eva-1');
    expect(prog).not.toBeNull();
    expect(prog!.positionSeconds).toBe(450);
    expect(prog!.durationSeconds).toBe(1420);
    expect(prog!.isCompleted).toBe(false);

    // Save watched status
    repo.markEpisodeWatched('ep-eva-1', 'title-eva', true);
    prog = repo.getWatchProgress('ep-eva-1');
    expect(prog!.isCompleted).toBe(true);
    expect(prog!.positionSeconds).toBe(1420);
  });

  it('should resolve next and previous episodes sequentially across seasons', () => {
    repo.upsertTitle({ id: 'title-seq', name: 'Series Sequence', authorizedSource: 'Test' });
    repo.upsertSeason({ id: 's1', titleId: 'title-seq', seasonNumber: 1, name: 'S1' });
    repo.upsertSeason({ id: 's2', titleId: 'title-seq', seasonNumber: 2, name: 'S2' });

    repo.upsertEpisode({ id: 'ep-s1-1', seasonId: 's1', titleId: 'title-seq', episodeNumber: 1, name: 'E1' });
    repo.upsertEpisode({ id: 'ep-s1-2', seasonId: 's1', titleId: 'title-seq', episodeNumber: 2, name: 'E2' });
    repo.upsertEpisode({ id: 'ep-s2-1', seasonId: 's2', titleId: 'title-seq', episodeNumber: 1, name: 'E3' });

    // Next from S1E1 -> S1E2
    const next1 = repo.getNextEpisode('ep-s1-1');
    expect(next1).not.toBeNull();
    expect(next1!.id).toBe('ep-s1-2');

    // Next from S1E2 -> S2E1 (cross season advancement!)
    const next2 = repo.getNextEpisode('ep-s1-2');
    expect(next2).not.toBeNull();
    expect(next2!.id).toBe('ep-s2-1');

    // Prev from S2E1 -> S1E2
    const prev1 = repo.getPreviousEpisode('ep-s2-1');
    expect(prev1).not.toBeNull();
    expect(prev1!.id).toBe('ep-s1-2');

    // Prev from S1E1 -> null
    const prevNone = repo.getPreviousEpisode('ep-s1-1');
    expect(prevNone).toBeNull();
  });

  it('should search titles and filter by category tabs', () => {
    repo.upsertTitle({ id: 't1', name: 'Attack on Titan', authorizedSource: 'Test' });
    repo.upsertTitle({ id: 't2', name: 'Mob Psycho 100', authorizedSource: 'Test' });

    // Search
    const searchTitan = repo.getTitles('all', 'Titan');
    expect(searchTitan.length).toBe(1);
    expect(searchTitan[0].name).toBe('Attack on Titan');

    const searchMob = repo.getTitles('all', 'mob');
    expect(searchMob.length).toBe(1);
    expect(searchMob[0].name).toBe('Mob Psycho 100');

    const searchEmpty = repo.getTitles('all', 'NonExistent');
    expect(searchEmpty.length).toBe(0);
  });
});
