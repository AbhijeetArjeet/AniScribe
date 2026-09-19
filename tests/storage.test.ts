import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { DownloadRepository } from '../src/main/storage/downloadRepository';
import { SettingsRepository } from '../src/main/storage/settingsRepository';
import { DownloadItem } from '../src/shared/types/download';

describe('SQLite Storage, Migrations & App State Persistence', () => {
  let tempDbPath: string;
  let db: any;
  let downloadRepo: DownloadRepository;
  let settingsRepo: SettingsRepository;

  beforeEach(() => {
    tempDbPath = path.join(os.tmpdir(), `bf-test-${Date.now()}-${Math.random().toString(36).substring(7)}.db`);
    db = initDatabase(tempDbPath);
    runMigrations(db);
    downloadRepo = new DownloadRepository(db);
    settingsRepo = new SettingsRepository(db);
  });

  afterEach(() => {
    db.close();
    try {
      fs.unlinkSync(tempDbPath);
    } catch {
      // ignore
    }
  });

  it('should save, retrieve, and update download items', () => {
    const item: DownloadItem = {
      id: 'task-1',
      url: 'https://example.com/test.zip',
      filename: 'test.zip',
      hostname: 'example.com',
      destination: '/downloads',
      totalSize: 1048576,
      downloadedBytes: 524288,
      percentage: 50,
      speed: 102400,
      eta: 5,
      status: 'Downloading',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 0,
      createdAt: Date.now(),
    };

    downloadRepo.saveDownload(item);

    const loaded = downloadRepo.getById('task-1');
    expect(loaded).toBeDefined();
    expect(loaded?.id).toBe('task-1');
    expect(loaded?.filename).toBe('test.zip');
    expect(loaded?.percentage).toBe(50);
    expect(loaded?.rangeSupported).toBe(true);

    // Update status to Completed
    downloadRepo.updateStatus('task-1', 'Completed');
    const updated = downloadRepo.getById('task-1');
    expect(updated?.status).toBe('Completed');
  });

  it('should restore unfinished queue state after restart', () => {
    const item1: DownloadItem = {
      id: 'task-downloading',
      url: 'https://example.com/file1.bin',
      filename: 'file1.bin',
      hostname: 'example.com',
      destination: '/tmp',
      totalSize: 1000,
      downloadedBytes: 300,
      percentage: 30,
      speed: 100,
      eta: 7,
      status: 'Downloading',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 0,
      createdAt: Date.now(),
    };

    const item2: DownloadItem = {
      id: 'task-waiting',
      url: 'https://example.com/file2.bin',
      filename: 'file2.bin',
      hostname: 'example.com',
      destination: '/tmp',
      totalSize: 2000,
      downloadedBytes: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
      status: 'Waiting',
      retryCount: 1,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 1,
      createdAt: Date.now(),
    };

    downloadRepo.saveDownload(item1);
    downloadRepo.saveDownload(item2);

    // Simulate app restart
    downloadRepo.resetUnfinishedOnStartup();

    const restored1 = downloadRepo.getById('task-downloading');
    const restored2 = downloadRepo.getById('task-waiting');

    expect(restored1?.status).toBe('Queued');
    expect(restored1?.speed).toBe(0);
    expect(restored2?.status).toBe('Queued');
  });

  it('should enforce concurrency bounds (1-5) and persist settings', () => {
    // Attempt saving concurrency 10
    const settings = settingsRepo.saveSettings({ concurrency: 10 });
    expect(settings.concurrency).toBe(5);

    // Attempt saving concurrency 0
    const settingsLow = settingsRepo.saveSettings({ concurrency: 0 });
    expect(settingsLow.concurrency).toBe(1);

    const reloaded = settingsRepo.getSettings();
    expect(reloaded.concurrency).toBe(1);
  });

  it('should record, retrieve, and clear download history', () => {
    const item: DownloadItem = {
      id: 'hist-1',
      url: 'https://example.com/archive.tar',
      filename: 'archive.tar',
      hostname: 'example.com',
      destination: '/downloads',
      totalSize: 5000,
      downloadedBytes: 5000,
      percentage: 100,
      speed: 0,
      eta: 0,
      status: 'Completed',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 0,
      createdAt: Date.now() - 1000,
      completedAt: Date.now(),
    };

    downloadRepo.addToHistory(item);
    const history = downloadRepo.getHistory();
    expect(history.length).toBe(1);
    expect(history[0].filename).toBe('archive.tar');
    expect(history[0].status).toBe('Completed');

    downloadRepo.clearHistory();
    expect(downloadRepo.getHistory().length).toBe(0);
  });
});
