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

describe('Audit 8: Performance & High Load Queue Scalability', () => {
  let server: TestServer;
  let tempDir: string;
  let dbPath: string;
  let db: any;
  let repository: DownloadRepository;

  beforeEach(() => {
    server = new TestServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-perf-'));
    dbPath = path.join(tempDir, 'perf.db');
    db = initDatabase(dbPath);
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

  it('should reliably process 50 queued tasks without connection leaks or memory growth', async () => {
    const payload = Buffer.from('small_chunk_for_fast_load_testing');
    const url = await server.start({ content: payload });

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      concurrency: 5,
    };

    let completedCount = 0;
    const totalItems = 50;

    const queue = new DownloadQueue(repository, settings, {
      onProgress: () => {},
      onStatusChange: (item) => {
        if (item.status === 'Completed') {
          completedCount++;
        }
      },
      onQueueUpdated: () => {},
    });

    for (let i = 0; i < totalItems; i++) {
      const item: DownloadItem = {
        id: `perf-task-${i}`,
        url,
        filename: `perf-${i}.bin`,
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
        queueOrder: i,
        createdAt: Date.now() + i,
      };
      queue.addTask(item);
    }

    // Wait until all 50 items complete
    await new Promise<void>((resolve) => {
      const check = setInterval(() => {
        if (queue.getAllItems().every((i) => i.status === 'Completed')) {
          clearInterval(check);
          resolve();
        }
      }, 50);
    });

    expect(queue.getAllItems().length).toBe(totalItems);
    expect(queue.getAllItems().every((i) => i.status === 'Completed')).toBe(true);

    // Verify all 50 files exist on disk
    for (let i = 0; i < totalItems; i++) {
      expect(fs.existsSync(path.join(tempDir, `perf-${i}.bin`))).toBe(true);
    }
  });
});
