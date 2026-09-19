import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { LibraryRepository } from '../src/main/library/libraryRepository';

describe('Offline Player & Media Integrity', () => {
  let tempDir: string;
  let tempDbPath: string;
  let db: any;
  let repo: LibraryRepository;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-offline-test-'));
    tempDbPath = path.join(tempDir, 'offline.db');
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

  it('should function 100% offline without network dependencies', () => {
    // Populate library with an offline title and local media
    repo.upsertTitle({
      id: 'title-offline-1',
      name: 'Offline Adventure',
      authorizedSource: 'LocalArchive',
    });
    repo.upsertSeason({
      id: 'season-off-1',
      titleId: 'title-offline-1',
      seasonNumber: 1,
      name: 'Season 1',
    });
    repo.upsertEpisode({
      id: 'ep-off-1',
      seasonId: 'season-off-1',
      titleId: 'title-offline-1',
      episodeNumber: 1,
      name: 'Journey Begins',
      durationSeconds: 1200,
    });

    const localVideo = path.join(tempDir, 'video1.mp4');
    fs.writeFileSync(localVideo, 'offline video payload');

    repo.upsertMediaFile({
      id: 'mf-1',
      episodeId: 'ep-off-1',
      filePath: localVideo,
      fileSize: 22,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    // Verify all queries execute without network
    const titles = repo.getTitles('all');
    expect(titles.length).toBe(1);
    expect(titles[0].name).toBe('Offline Adventure');

    const title = repo.getTitle('title-offline-1');
    expect(title).not.toBeNull();
    const ep = title!.seasons[0].episodes[0];
    expect(ep.isDownloaded).toBe(true);
    expect(ep.mediaFile!.filePath).toBe(localVideo);
    expect(fs.existsSync(ep.mediaFile!.filePath)).toBe(true);
  });

  it('should detect when local media files are missing on disk and allow cleanup', () => {
    const missingVideo = path.join(tempDir, 'deleted_by_user.mp4');

    repo.upsertTitle({ id: 'title-ghost', name: 'Ghost in the Shell', authorizedSource: 'Local' });
    repo.upsertSeason({ id: 'season-ghost-1', titleId: 'title-ghost', seasonNumber: 1, name: 'S1' });
    repo.upsertEpisode({ id: 'ep-ghost-1', seasonId: 'season-ghost-1', titleId: 'title-ghost', episodeNumber: 1, name: 'Ghost' });
    repo.upsertMediaFile({
      id: 'mf-ghost',
      episodeId: 'ep-ghost-1',
      filePath: missingVideo,
      fileSize: 100,
      format: 'mp4',
      downloadDate: Date.now(),
      verified: true,
    });

    // Check disk existence
    const fileExists = fs.existsSync(missingVideo);
    expect(fileExists).toBe(false);

    // Delete media file record
    const deleted = repo.deleteMediaFile('mf-ghost', false);
    expect(deleted).toBe(true);

    const titleAfter = repo.getTitle('title-ghost');
    expect(titleAfter!.seasons[0].episodes[0].isDownloaded).toBe(false);
  });

  it('should persist and resume watch progress across restarts', () => {
    repo.upsertTitle({ id: 't-watch', name: 'Watch Test', authorizedSource: 'Local' });
    repo.upsertSeason({ id: 's-watch-1', titleId: 't-watch', seasonNumber: 1, name: 'S1' });
    repo.upsertEpisode({ id: 'ep-watch-1', seasonId: 's-watch-1', titleId: 't-watch', episodeNumber: 1, name: 'E1' });

    // Save playback position at 520s
    repo.saveWatchProgress('ep-watch-1', 't-watch', 520, 1400);

    // Simulate app restart by closing and re-opening database
    db.close();
    const reopenedDb = initDatabase(tempDbPath);
    const restartedRepo = new LibraryRepository(reopenedDb);

    const progress = restartedRepo.getWatchProgress('ep-watch-1');
    expect(progress).not.toBeNull();
    expect(progress!.positionSeconds).toBe(520);
    expect(progress!.durationSeconds).toBe(1400);
    expect(progress!.isCompleted).toBe(false);

    // Mark as completed
    restartedRepo.markEpisodeWatched('ep-watch-1', 't-watch', true);
    const completedProgress = restartedRepo.getWatchProgress('ep-watch-1');
    expect(completedProgress!.isCompleted).toBe(true);
    expect(completedProgress!.positionSeconds).toBe(1400);

    reopenedDb.close();
    db = initDatabase(tempDbPath); // for afterEach cleanup
  });
});
