import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import http from 'http';
import { AddressInfo } from 'net';
import { RangeDownloader } from '../src/main/downloader/RangeDownloader';

describe('Audit 3: Download Engine Edge Cases & Regression Suite', () => {
  let tempDir: string;
  let server: http.Server | null = null;
  let serverPort: number = 0;
  const originalPayload = Buffer.from('PAYLOAD_0123456789_AUDIT_EXACT_STREAM_MATCHING_'.repeat(50)); // ~2.4 KB

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-audit-eng-'));
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((r) => server!.close(() => r()));
      server = null;
    }
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('CRITICAL: Existing .part file + server ignores Range (returns 200) MUST overwrite and not append duplicate data', async () => {
    // Server ignores Range header and returns 200 OK with full content
    server = http.createServer((req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': originalPayload.length,
          'Accept-Ranges': 'none',
        });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Length': originalPayload.length,
        'Content-Type': 'application/octet-stream',
      });
      res.end(originalPayload);
    });

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        serverPort = (server!.address() as AddressInfo).port;
        resolve();
      });
    });

    const fileUrl = `http://127.0.0.1:${serverPort}/test.bin`;
    const partPath = path.join(tempDir, 'test.bin.part');
    const finalPath = path.join(tempDir, 'test.bin');

    // Pre-seed an existing .part file with 500 garbage bytes
    const garbage = Buffer.from('G'.repeat(500));
    fs.writeFileSync(partPath, garbage);
    expect(fs.statSync(partPath).size).toBe(500);

    const downloader = new RangeDownloader();
    const result = await downloader.start({
      url: fileUrl,
      destinationDir: tempDir,
      filename: 'test.bin',
      onProgress: () => {},
    });

    expect(result.totalBytes).toBe(originalPayload.length);
    expect(fs.existsSync(finalPath)).toBe(true);
    expect(fs.existsSync(partPath)).toBe(false);

    const saved = fs.readFileSync(finalPath);
    // Size must match originalPayload exactly, NOT 500 + originalPayload!
    expect(saved.length).toBe(originalPayload.length);
    expect(saved.equals(originalPayload)).toBe(true);
  });

  it('CRITICAL: Corrupted .part file larger than totalSize must be safely reset to 0', async () => {
    server = http.createServer((req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': originalPayload.length,
          'Accept-Ranges': 'bytes',
        });
        res.end();
        return;
      }
      res.writeHead(200, {
        'Content-Length': originalPayload.length,
        'Content-Type': 'application/octet-stream',
      });
      res.end(originalPayload);
    });

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        serverPort = (server!.address() as AddressInfo).port;
        resolve();
      });
    });

    const fileUrl = `http://127.0.0.1:${serverPort}/corrupt.bin`;
    const partPath = path.join(tempDir, 'corrupt.bin.part');

    // Seed .part with twice the expected file size (corrupted)
    fs.writeFileSync(partPath, Buffer.from('X'.repeat(originalPayload.length * 2)));

    const downloader = new RangeDownloader();
    const result = await downloader.start({
      url: fileUrl,
      destinationDir: tempDir,
      filename: 'corrupt.bin',
      onProgress: () => {},
    });

    const saved = fs.readFileSync(path.join(tempDir, 'corrupt.bin'));
    expect(saved.length).toBe(originalPayload.length);
    expect(saved.equals(originalPayload)).toBe(true);
  });

  it('CRITICAL: Premature socket disconnect throws retryable error and does NOT rename partial file to final', async () => {
    // Server advertises 10000 bytes but terminates socket after 500 bytes
    server = http.createServer((req, res) => {
      if (req.method === 'HEAD') {
        res.writeHead(200, {
          'Content-Length': 10000,
          'Accept-Ranges': 'bytes',
        });
        res.end();
        return;
      }

      res.writeHead(200, {
        'Content-Length': 10000,
        'Content-Type': 'application/octet-stream',
      });
      res.write(Buffer.from('Z'.repeat(500)));
      setTimeout(() => {
        res.destroy();
      }, 50);
    });

    await new Promise<void>((resolve) => {
      server!.listen(0, '127.0.0.1', () => {
        serverPort = (server!.address() as AddressInfo).port;
        resolve();
      });
    });

    const fileUrl = `http://127.0.0.1:${serverPort}/premature.bin`;
    const partPath = path.join(tempDir, 'premature.bin.part');
    const finalPath = path.join(tempDir, 'premature.bin');

    const downloader = new RangeDownloader();
    let caughtErr: any = null;

    try {
      await downloader.start({
        url: fileUrl,
        destinationDir: tempDir,
        filename: 'premature.bin',
        onProgress: () => {},
      });
    } catch (err) {
      caughtErr = err;
    }

    expect(caughtErr).toBeDefined();
    // Final file MUST NOT exist
    expect(fs.existsSync(finalPath)).toBe(false);
    // .part file MUST exist
    expect(fs.existsSync(partPath)).toBe(true);
  });
});
