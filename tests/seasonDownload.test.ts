import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { DownloadRepository } from '../src/main/storage/downloadRepository';
import { SettingsRepository } from '../src/main/storage/settingsRepository';
import { DownloadManager } from '../src/main/downloader/DownloadManager';
import { LibraryRepository } from '../src/main/library/libraryRepository';
import { TitleMetadata, EpisodeMetadata, DownloadVariant } from '../src/shared/types/provider';

describe('Season Batch Download Workflow', () => {
  let tempDir: string;
  let tempDbPath: string;
  let db: any;
  let downloadRepo: DownloadRepository;
  let settingsRepo: SettingsRepository;
  let libraryRepo: LibraryRepository;
  let downloadManager: DownloadManager;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-seasondl-test-'));
    tempDbPath = path.join(tempDir, 'test.db');
    db = initDatabase(tempDbPath);
    runMigrations(db);

    downloadRepo = new DownloadRepository(db);
    settingsRepo = new SettingsRepository(db);
    settingsRepo.updateSettings({ downloadDirectory: tempDir });
    libraryRepo = new LibraryRepository(db);

    downloadManager = new DownloadManager(downloadRepo, settingsRepo, () => null);
  });

  afterEach(() => {
    downloadManager.dispose();
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should batch-queue season episodes using existing DownloadManager and register library metadata', async () => {
    const titleMeta: TitleMetadata = {
      id: 'title-bocchi',
      title: 'Bocchi the Rock!',
      description: 'Music anime',
      authorizedSource: 'PublicMediaAPI',
    };

    const episodes: EpisodeMetadata[] = [
      {
        id: 'bocchi-ep-1',
        titleId: 'title-bocchi',
        seasonNumber: 1,
        episodeNumber: 1,
        name: 'Lonely Rolling Bocchi',
        durationSeconds: 1420,
      },
      {
        id: 'bocchi-ep-2',
        titleId: 'title-bocchi',
        seasonNumber: 1,
        episodeNumber: 2,
        name: 'See You Tomorrow',
        durationSeconds: 1420,
      },
    ];

    const variants: Record<string, DownloadVariant> = {
      'bocchi-ep-1': {
        id: 'var-bocchi-1',
        episodeId: 'bocchi-ep-1',
        quality: '1080p',
        audioTrack: 'Original',
        subtitles: ['English'],
        directUrl: 'https://example.com/bocchi_s01e01_1080p.mp4',
        format: 'mp4',
      },
      'bocchi-ep-2': {
        id: 'var-bocchi-2',
        episodeId: 'bocchi-ep-2',
        quality: '1080p',
        audioTrack: 'Original',
        subtitles: ['English'],
        directUrl: 'https://example.com/bocchi_s01e02_1080p.mp4',
        format: 'mp4',
      },
    };

    // 1. Register title, season, episodes in library
    libraryRepo.upsertTitle({
      id: titleMeta.id,
      name: titleMeta.title,
      description: titleMeta.description,
      authorizedSource: titleMeta.authorizedSource,
      createdAt: Date.now(),
    });

    const seasonId = `${titleMeta.id}-s1`;
    libraryRepo.upsertSeason({
      id: seasonId,
      titleId: titleMeta.id,
      seasonNumber: 1,
      name: 'Season 1',
      episodeCount: episodes.length,
    });

    for (const ep of episodes) {
      libraryRepo.upsertEpisode({
        id: ep.id,
        seasonId,
        titleId: titleMeta.id,
        episodeNumber: ep.episodeNumber,
        name: ep.name,
        durationSeconds: ep.durationSeconds,
      });
    }

    // 2. Queue downloads for each episode with direct authorized URL
    const queuedItems: any[] = [];
    for (const ep of episodes) {
      const variant = variants[ep.id];
      const added = await downloadManager.addUrls([variant.directUrl], {
        title: titleMeta.title,
        episode: `S01E0${ep.episodeNumber}`,
        quality: variant.quality,
      });
      queuedItems.push(...added);
    }

    // Verify downloads were queued properly
    expect(queuedItems.length).toBe(2);
    expect(queuedItems[0].title).toBe('Bocchi the Rock!');
    expect(queuedItems[0].episode).toBe('S01E01');
    expect(queuedItems[0].quality).toBe('1080p');
    expect(queuedItems[1].episode).toBe('S01E02');

    // Verify library reflects episodes as pending (not downloaded yet)
    const title = libraryRepo.getTitle('title-bocchi');
    expect(title).not.toBeNull();
    expect(title!.downloadedEpisodes).toBe(0);
    expect(title!.totalEpisodes).toBe(2);
    expect(title!.seasons[0].episodes[0].isDownloaded).toBe(false);
  });
});
