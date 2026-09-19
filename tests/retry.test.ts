import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { parseRetryAfter } from '../src/main/network/RetryAfter';
import { RetryManager } from '../src/main/downloader/RetryManager';
import { TestServer } from './testServer';
import { DownloadTask } from '../src/main/downloader/DownloadTask';
import { AppSettings, DEFAULT_SETTINGS } from '../src/shared/types/settings';
import { DownloadItem } from '../src/shared/types/download';

describe('Retry Handling, 429 & Retry-After Countdown', () => {
  let server: TestServer;
  let tempDir: string;

  beforeEach(() => {
    server = new TestServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-retry-'));
  });

  afterEach(async () => {
    await server.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should parse integer seconds and HTTP-date in Retry-After header', () => {
    // Delta-seconds
    const res1 = parseRetryAfter('5');
    expect(res1.delayMs).toBe(5000);
    expect(res1.retryAt).toBeGreaterThanOrEqual(Date.now() + 4900);

    // HTTP-date 10 seconds in future
    const futureDate = new Date(Date.now() + 10000).toUTCString();
    const res2 = parseRetryAfter(futureDate);
    expect(res2.delayMs).toBeGreaterThanOrEqual(9000);

    // Fallback when missing
    const res3 = parseRetryAfter(undefined, 3000);
    expect(res3.delayMs).toBe(3000);
  });

  it('should respect 429 Rate Limit, enter Waiting status, and succeed after retry', async () => {
    const payload = Buffer.from('rate_limited_data_chunk_success');
    // Return 429 once with Retry-After: 1, then return 200 OK
    const url = await server.start({
      content: payload,
      rateLimitAttempts: 1,
      retryAfterSeconds: 1,
    });

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    const item: DownloadItem = {
      id: 'task-429',
      url,
      filename: '429test.bin',
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

    let observedWaiting = false;
    let waitingReason = '';

    const task = new DownloadTask(item, settings, {
      onProgress: () => {},
      onStatusChange: (updated) => {
        if (updated.status === 'Waiting') {
          observedWaiting = true;
          waitingReason = updated.waitingReason || '';
        }
      },
      onComplete: () => {},
      onError: () => {},
    });

    await task.start();

    expect(observedWaiting).toBe(true);
    expect(waitingReason).toContain('Server requested a retry');
    expect(item.status).toBe('Completed');
    expect(fs.existsSync(path.join(tempDir, '429test.bin'))).toBe(true);
  });

  it('should handle temporary 503 errors and complete after retry', async () => {
    const payload = Buffer.from('503_recovery_test_payload');
    // Return 503 once with Retry-After: 1, then succeed
    const url = await server.start({
      content: payload,
      serverErrorAttempts: 1,
      retryAfterSeconds: 1,
    });

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      maxRetries: 3,
      retryDelayMs: 1000,
    };

    const item: DownloadItem = {
      id: 'task-503',
      url,
      filename: '503test.bin',
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

    const task = new DownloadTask(item, settings, {
      onProgress: () => {},
      onStatusChange: () => {},
      onComplete: () => {},
      onError: () => {},
    });

    await task.start();

    expect(item.status).toBe('Completed');
    expect(fs.existsSync(path.join(tempDir, '503test.bin'))).toBe(true);
  });

  it('should fail when maximum retry attempts are exceeded', async () => {
    // Return 503 indefinitely
    const url = await server.start({
      serverErrorAttempts: 10,
      retryAfterSeconds: 1,
    });

    const settings: AppSettings = {
      ...DEFAULT_SETTINGS,
      downloadDirectory: tempDir,
      maxRetries: 1,
      retryDelayMs: 500,
    };

    const item: DownloadItem = {
      id: 'task-fail',
      url,
      filename: 'failtest.bin',
      hostname: '127.0.0.1',
      destination: tempDir,
      totalSize: 0,
      downloadedBytes: 0,
      percentage: 0,
      speed: 0,
      eta: 0,
      status: 'Queued',
      retryCount: 0,
      maxRetries: 1,
      rangeSupported: true,
      queueOrder: 0,
      createdAt: Date.now(),
    };

    const task = new DownloadTask(item, settings, {
      onProgress: () => {},
      onStatusChange: () => {},
      onComplete: () => {},
      onError: () => {},
    });

    await task.start();

    expect(item.status).toBe('Failed');
    expect(item.error).toContain('Max retries');
  });
});
