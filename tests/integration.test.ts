import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TestServer } from './testServer';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { DownloadRepository } from '../src/main/storage/downloadRepository';
import { SettingsRepository } from '../src/main/storage/settingsRepository';
import { DownloadManager } from '../src/main/downloader/DownloadManager';

describe('BatchFetch End-to-End DownloadManager Integration', () => {
  let server: TestServer;
  let tempDir: string;
  let tempDbPath: string;
  let db: any;
  let downloadRepo: DownloadRepository;
  let settingsRepo: SettingsRepository;
  let downloadManager: DownloadManager;

  beforeEach(() => {
    server = new TestServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-e2e-'));
    tempDbPath = path.join(tempDir, 'e2e.db');
    db = initDatabase(tempDbPath);
    runMigrations(db);
    downloadRepo = new DownloadRepository(db);
    settingsRepo = new SettingsRepository(db);

    settingsRepo.saveSettings({
      downloadDirectory: tempDir,
      concurrency: 3,
    });

    downloadManager = new DownloadManager(downloadRepo, settingsRepo, () => null);
  });

  afterEach(async () => {
    try {
      await server.stop();
    } catch {}
    try {
      db.close();
    } catch {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should process batch downloads, record history, and persist state', async () => {
    const payload1 = Buffer.from('payload_one_data'.repeat(20));
    const url1 = await server.start({ content: payload1, supportRange: true });

    const added = await downloadManager.addUrls([url1]);
    expect(added.length).toBe(1);
    const item = added[0];
    expect(['Queued', 'Downloading', 'Completed']).toContain(item.status);

    // Wait until completed
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        clearInterval(interval);
        reject(new Error('Download timed out'));
      }, 5000);

      const interval = setInterval(() => {
        const current = downloadManager.getAll().find((i) => i.id === item.id);
        if (current && current.status === 'Completed') {
          clearInterval(interval);
          clearTimeout(timeout);
          resolve();
        }
      }, 50);
    });

    const finalItem = downloadManager.getAll().find((i) => i.id === item.id);
    expect(finalItem?.status).toBe('Completed');
    expect(finalItem?.percentage).toBe(100);

    // Verify history contains completed download
    const history = downloadManager.getHistory();
    expect(history.length).toBeGreaterThanOrEqual(1);
    expect(history[0].id).toBe(item.id);
  });
});
