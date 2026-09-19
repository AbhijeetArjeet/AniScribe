import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { TestServer } from './testServer';
import { RangeDownloader } from '../src/main/downloader/RangeDownloader';

describe('RangeDownloader & HTTP Engine', () => {
  let server: TestServer;
  let tempDir: string;
  const testPayload = Buffer.from('HelloWorld_1234567890_BatchFetch_Secure_Range_Engine_Test_Buffer'.repeat(50)); // ~3.2 KB

  beforeEach(() => {
    server = new TestServer();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-download-'));
  });

  afterEach(async () => {
    await server.stop();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should download a single file completely and atomically rename .part', async () => {
    const url = await server.start({ content: testPayload, supportRange: true });
    const downloader = new RangeDownloader();

    const progressUpdates: number[] = [];
    const result = await downloader.start({
      url,
      destinationDir: tempDir,
      filename: 'file.bin',
      onProgress: (p) => progressUpdates.push(p.downloadedBytes),
    });

    expect(result.totalBytes).toBe(testPayload.length);
    expect(fs.existsSync(path.join(tempDir, 'file.bin'))).toBe(true);
    expect(fs.existsSync(path.join(tempDir, 'file.bin.part'))).toBe(false);

    const savedContent = fs.readFileSync(path.join(tempDir, 'file.bin'));
    expect(savedContent.equals(testPayload)).toBe(true);
  });

  it('should download from a server WITHOUT Range support safely', async () => {
    const url = await server.start({ content: testPayload, supportRange: false });
    const downloader = new RangeDownloader();

    const result = await downloader.start({
      url,
      destinationDir: tempDir,
      filename: 'norange.bin',
      onProgress: () => {},
    });

    expect(result.totalBytes).toBe(testPayload.length);
    expect(fs.existsSync(path.join(tempDir, 'norange.bin'))).toBe(true);
    const savedContent = fs.readFileSync(path.join(tempDir, 'norange.bin'));
    expect(savedContent.equals(testPayload)).toBe(true);
  });

  it('should resume download from existing .part file when Range is supported', async () => {
    const url = await server.start({ content: testPayload, supportRange: true });

    // Pre-create .part file with first 100 bytes
    const partPath = path.join(tempDir, 'resumable.bin.part');
    const initialBytes = testPayload.subarray(0, 100);
    fs.writeFileSync(partPath, initialBytes);

    const downloader = new RangeDownloader();
    const result = await downloader.start({
      url,
      destinationDir: tempDir,
      filename: 'resumable.bin',
      onProgress: () => {},
    });

    expect(server.lastRequestedRange).toBe('bytes=100-');
    expect(fs.existsSync(path.join(tempDir, 'resumable.bin'))).toBe(true);
    expect(fs.existsSync(partPath)).toBe(false);

    const savedContent = fs.readFileSync(path.join(tempDir, 'resumable.bin'));
    expect(savedContent.equals(testPayload)).toBe(true);
  });

  it('should safely restart from byte 0 if .part exists but server lacks Range support', async () => {
    const url = await server.start({ content: testPayload, supportRange: false });

    // Pre-create .part file with partial bytes
    const partPath = path.join(tempDir, 'fallback.bin.part');
    fs.writeFileSync(partPath, testPayload.subarray(0, 50));

    const downloader = new RangeDownloader();
    const result = await downloader.start({
      url,
      destinationDir: tempDir,
      filename: 'fallback.bin',
      onProgress: () => {},
    });

    expect(fs.existsSync(path.join(tempDir, 'fallback.bin'))).toBe(true);
    const savedContent = fs.readFileSync(path.join(tempDir, 'fallback.bin'));
    expect(savedContent.equals(testPayload)).toBe(true);
  });

  it('should stop network stream and preserve .part when paused', async () => {
    const largePayload = Buffer.from('x'.repeat(100 * 1024)); // 100KB
    const url = await server.start({ content: largePayload, supportRange: true, slowStream: true });

    const downloader = new RangeDownloader();
    let paused = false;

    const downloadPromise = downloader.start({
      url,
      destinationDir: tempDir,
      filename: 'pause_test.bin',
      onProgress: (p) => {
        if (p.downloadedBytes > 500 && !paused) {
          paused = true;
          downloader.pause();
        }
      },
    });

    await expect(downloadPromise).rejects.toThrow('PAUSED');

    // Verify .part file is preserved
    const partPath = path.join(tempDir, 'pause_test.bin.part');
    expect(fs.existsSync(partPath)).toBe(true);
    expect(fs.statSync(partPath).size).toBeGreaterThan(0);
    // Final file must not exist yet
    expect(fs.existsSync(path.join(tempDir, 'pause_test.bin'))).toBe(false);
  });
});
