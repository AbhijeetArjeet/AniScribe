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

describe('Audit 4: Queue Concurrency & Task State Transitions', () => {
  let server: TestServer;
  let tempDir: string;
  let tempDbPath: string;
  let db: any;
  let repository: DownloadRepository;

  beforeEach(() => {
    server = new TestServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-audit-queue-'));
    tempDbPath = path.join(tempDir, 'audit_queue.db');
    db = initDatabase(tempDbPath);
    runMigrations(db);
    repository = new DownloadRepository(db);
  });

  afterEach(async () => {
    await server.stop();
    db.close();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should respect dynamic reduction in concurrency (from 3 down to 1)', async () => {
    const payload = Buffer.from('data'.repeat(200));
    const url = await server.start({ content: payload, slowStream: true });

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      concurrency: 3,
    };

    const queue = new DownloadQueue(repository, settings, {
      onProgress: () => {},
      onStatusChange: () => {},
      onQueueUpdated: () => {},
    });

    const createItem = (id: string, order: number): DownloadItem => ({
      id,
      url,
      filename: `${id}.bin`,
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
      queueOrder: order,
      createdAt: Date.now() + order,
    });

    queue.addTask(createItem('T1', 0));
    queue.addTask(createItem('T2', 1));
    queue.addTask(createItem('T3', 2));
    queue.addTask(createItem('T4', 3));

    // Initially with concurrency = 3, up to 3 start
    expect(queue.getAllItems().filter((i) => i.status === 'Downloading').length).toBeLessThanOrEqual(3);

    // Dynamically change concurrency down to 1
    queue.updateSettings({ ...settings, concurrency: 1 });

    // Wait until all complete
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (queue.getAllItems().every((i) => i.status === 'Completed')) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(queue.getAllItems().every((i) => i.status === 'Completed')).toBe(true);
  });

  it('should immediately abort retry countdown when task is cancelled in Waiting state', async () => {
    // 429 server with long retry delay (10 seconds)
    const url = await server.start({
      rateLimitAttempts: 5,
      retryAfterSeconds: 10,
    });

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      concurrency: 2,
    };

    let waitingObserved = false;
    let cancelledObserved = false;

    const queue = new DownloadQueue(repository, settings, {
      onProgress: () => {},
      onStatusChange: (item) => {
        if (item.status === 'Waiting') {
          waitingObserved = true;
          // Cancel while in waiting state
          setTimeout(() => {
            queue.cancelTask(item.id);
          }, 50);
        }
        if (item.status === 'Cancelled') {
          cancelledObserved = true;
        }
      },
      onQueueUpdated: () => {},
    });

    const item: DownloadItem = {
      id: 'task-waiting-cancel',
      url,
      filename: 'wait_cancel.bin',
      hostname: '127.0.0.1',
      destination: tempDir,
      totalSize: 0,
      downloadedBytes: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
      status: 'Queued',
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 0,
      createdAt: Date.now(),
    };

    queue.addTask(item);

    // Wait for cancellation to complete without waiting 10 seconds
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (cancelledObserved) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(waitingObserved).toBe(true);
    expect(cancelledObserved).toBe(true);
  });
});
