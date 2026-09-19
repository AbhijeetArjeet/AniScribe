import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TestServer } from './testServer';
import { initDatabase } from '../src/main/storage/database';
import { runMigrations } from '../src/main/storage/migrations';
import { DownloadRepository } from '../src/main/storage/downloadRepository';
import { DownloadQueue } from '../src/main/queue/DownloadQueue';
import { AppSettings, DEFAULT_SETTINGS } from '../src/shared/types/settings';
import { DownloadItem } from '../src/shared/types/download';

describe('DownloadQueue & Concurrency Management', () => {
  let server: TestServer;
  let tempDir: string;
  let tempDbPath: string;
  let db: any;
  let repository: DownloadRepository;

  beforeEach(() => {
    server = new TestServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-queue-'));
    tempDbPath = path.join(tempDir, 'test.db');
    db = initDatabase(tempDbPath);
    runMigrations(db);
    repository = new DownloadRepository(db);
  });

  afterEach(async () => {
    await server.stop();
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should enforce concurrency limit (e.g. concurrency = 2) with multiple queued items', async () => {
    const payload = Buffer.from('data'.repeat(100));
    const url = await server.start({ content: payload });

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      concurrency: 2,
    };

    let activeRunningCount = 0;
    let maxObservedActive = 0;

    const queue = new DownloadQueue(repository, settings, {
      onProgress: () => {},
      onStatusChange: (item) => {
        const active = queue.getAllItems().filter((i) => i.status === 'Downloading').length;
        if (active > maxObservedActive) {
          maxObservedActive = active;
        }
      },
      onQueueUpdated: () => {},
    });

    // Create 4 items
    const items: DownloadItem[] = [1, 2, 3, 4].map((idx) => ({
      id: `task-${idx}`,
      url,
      filename: `item-${idx}.bin`,
      hostname: '127.0.0.1',
      destination: tempDir,
      totalSize: payload.length,
      downloadedBytes: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
      status: 'Queued',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: idx - 1,
      createdAt: Date.now() + idx,
    }));

    for (const item of items) {
      queue.addTask(item);
    }

    // Wait until all 4 complete
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        const allCompleted = queue.getAllItems().every((i) => i.status === 'Completed');
        if (allCompleted) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(maxObservedActive).toBeLessThanOrEqual(2);
    expect(queue.getAllItems().every((i) => i.status === 'Completed')).toBe(true);
  });

  it('should reorder items in the queue properly', () => {
    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
    };

    const queue = new DownloadQueue(repository, settings, {
      onProgress: () => {},
      onStatusChange: () => {},
      onQueueUpdated: () => {},
    });

    const createItem = (id: string, order: number): DownloadItem => ({
      id,
      url: 'http://example.com/file.bin',
      filename: `${id}.bin`,
      hostname: 'example.com',
      destination: tempDir,
      totalSize: 100,
      downloadedBytes: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
      status: 'Queued',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: order,
      createdAt: Date.now(),
    });

    queue.addTask(createItem('A', 0));
    queue.addTask(createItem('B', 1));
    queue.addTask(createItem('C', 2));

    // Move C (index 2) to top (index 0)
    queue.reorder('C', 0);

    const ordered = queue.getAllItems().map((i) => i.id);
    expect(ordered).toEqual(['C', 'A', 'B']);
  });
});
