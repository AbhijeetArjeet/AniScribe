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
import { DownloadItem } from '../src/shared/types/download';

describe('Audit 5: Application Restart & State Recovery', () => {
  let server: TestServer;
  let tempDir: string;
  let dbPath: string;

  beforeEach(() => {
    server = new TestServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-audit-restart-'));
    dbPath = path.join(tempDir, 'restart_test.db');
  });

  afterEach(async () => {
    await server.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should restore unfinished queue items upon restart without duplicating or restarting completed files', async () => {
    const payload = Buffer.from('CONTENT_ABC_'.repeat(100)); // ~1.2 KB
    const url = await server.start({ content: payload, supportRange: true });

    // Session 1
    const db1 = initDatabase(dbPath);
    runMigrations(db1);
    const repo1 = new DownloadRepository(db1);
    const settingsRepo1 = new SettingsRepository(db1);
    settingsRepo1.saveSettings({ downloadDirectory: tempDir, concurrency: 2 });

    // Seed: 1 Completed item, 1 Downloading item with .part file, 1 Waiting item
    const completedItem: DownloadItem = {
      id: 'item-done',
      url,
      filename: 'completed.bin',
      hostname: '127.0.0.1',
      destination: tempDir,
      totalSize: payload.length,
      downloadedBytes: payload.length,
      percentage: 100,
      speed: 0,
      eta: 0,
      status: 'Completed',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 0,
      createdAt: Date.now() - 5000,
      completedAt: Date.now() - 1000,
    };
    repo1.saveDownload(completedItem);
    repo1.addToHistory(completedItem);
    fs.writeFileSync(path.join(tempDir, 'completed.bin'), payload);

    const midStreamItem: DownloadItem = {
      id: 'item-mid',
      url,
      filename: 'mid.bin',
      hostname: '127.0.0.1',
      destination: tempDir,
      totalSize: payload.length,
      downloadedBytes: 300,
      percentage: 25,
      speed: 50000,
      eta: 2,
      status: 'Downloading',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 1,
      createdAt: Date.now() - 2000,
    };
    repo1.saveDownload(midStreamItem);
    // Write partial .part file
    fs.writeFileSync(path.join(tempDir, 'mid.bin.part'), payload.subarray(0, 300));

    // Close session 1
    db1.close();

    // Session 2: Reopen as new application instance
    const db2 = initDatabase(dbPath);
    const repo2 = new DownloadRepository(db2);
    const settingsRepo2 = new SettingsRepository(db2);
    const manager = new DownloadManager(repo2, settingsRepo2, () => null);

    const allItems = manager.getAll();
    expect(allItems.length).toBe(2);

    const restoredDone = allItems.find((i) => i.id === 'item-done');
    expect(restoredDone?.status).toBe('Completed');

    // Verify mid-stream download is restored and automatically resumes to completion
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const currentMid = manager.getAll().find((i) => i.id === 'item-mid');
        if (currentMid && currentMid.status === 'Completed') {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    const finalMid = manager.getAll().find((i) => i.id === 'item-mid');
    expect(finalMid?.status).toBe('Completed');
    expect(finalMid?.percentage).toBe(100);

    const downloadedMid = fs.readFileSync(path.join(tempDir, 'mid.bin'));
    expect(downloadedMid.equals(payload)).toBe(true);

    // Verify history does not have duplicates
    const history = manager.getHistory();
    const doneHist = history.filter((h) => h.id === 'item-done');
    expect(doneHist.length).toBe(1);

    db2.close();
  });
});
