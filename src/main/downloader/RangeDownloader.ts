import fs from 'fs';
import path from 'path';
import { HttpClient, HttpResponse } from '../network/HttpClient';
import { probeMetadata, RemoteMetadata } from '../network/RangeSupport';

export interface RangeDownloadOptions {
  url: string;
  destinationDir: string;
  filename: string;
  expectedTotalSize?: number;
  timeoutMs?: number;
  overwrite?: boolean;
  onProgress: (progress: {
    downloadedBytes: number;
    totalSize: number;
    percentage: number;
    speed: number;
    eta: number;
    rangeSupported: boolean;
  }) => void;
}

export class RangeDownloader {
  private abortController: (() => void) | null = null;
  private writeStream: fs.WriteStream | null = null;
  private isPaused: boolean = false;
  private isCancelled: boolean = false;
  private rejectCurrentPromise: ((reason?: any) => void) | null = null;

  static getSafeFilename(destinationDir: string, filename: string, overwrite: boolean = false): string {
    if (overwrite) {
      return filename;
    }
    const fullPath = path.join(destinationDir, filename);
    if (!fs.existsSync(fullPath)) {
      return filename;
    }
    const ext = path.extname(filename);
    const base = path.basename(filename, ext);
    let counter = 1;
    while (true) {
      const candidate = `${base} (${counter})${ext}`;
      if (!fs.existsSync(path.join(destinationDir, candidate))) {
        return candidate;
      }
      counter++;
    }
  }

  static applyFilenameTemplate(
    template: string,
    context: { title?: string; episode?: string; quality?: string; ext?: string; originalFilename?: string }
  ): string {
    const ext = context.ext || (context.originalFilename ? path.extname(context.originalFilename).replace(/^\./, '') : 'bin');
    const baseWithoutExt = context.originalFilename ? path.basename(context.originalFilename, path.extname(context.originalFilename)) : 'download';
    
    let result = template;
    result = result.replace(/{title}/g, context.title || baseWithoutExt);
    result = result.replace(/{episode}/g, context.episode || '1');
    result = result.replace(/{quality}/g, context.quality || 'Standard');
    result = result.replace(/{ext}/g, ext);
    
    result = result.replace(/[\\/:*?"<>|]/g, '_').trim();
    if (!result || result === `.${ext}`) {
      result = `${baseWithoutExt}.${ext}`;
    }
    return result;
  }

  static mapDiskError(err: any): string {
    if (!err) return 'Unknown error occurred';
    if (err.code === 'ENOSPC') {
      return 'Disk is full: Not enough space available to write file';
    }
    if (err.code === 'EACCES' || err.code === 'EPERM') {
      return 'Permission denied: Cannot write to download directory';
    }
    if (err.code === 'ENOENT') {
      return 'Destination folder does not exist or is invalid';
    }
    if (err.code === 'EROFS') {
      return 'Read-only filesystem: Cannot write files';
    }
    return err.message || String(err);
  }

  async start(options: RangeDownloadOptions): Promise<{ finalPath: string; totalBytes: number }> {
    const { url, destinationDir, filename, timeoutMs = 15000, onProgress } = options;

    if (!fs.existsSync(destinationDir)) {
      try {
        fs.mkdirSync(destinationDir, { recursive: true });
      } catch (err: any) {
        throw new Error(RangeDownloader.mapDiskError(err));
      }
    }

    const partPath = path.join(destinationDir, `${filename}.part`);
    const finalPath = path.join(destinationDir, filename);

    // 1. Check existing .part size
    let existingBytes = 0;
    if (fs.existsSync(partPath)) {
      try {
        const stat = fs.statSync(partPath);
        existingBytes = stat.size;
      } catch {
        existingBytes = 0;
      }
    }

    // 2. Probe server metadata
    let metadata: RemoteMetadata;
    try {
      metadata = await probeMetadata(url, timeoutMs);
    } catch {
      metadata = {
        url,
        finalUrl: url,
        statusCode: 200,
        contentLength: options.expectedTotalSize || 0,
        acceptRanges: false,
      };
    }

    let totalSize = metadata.contentLength || options.expectedTotalSize || 0;
    let rangeSupported = metadata.acceptRanges;

    // Guard: If existing .part is larger than totalSize (corrupted .part), delete and reset to 0
    if (totalSize > 0 && existingBytes > totalSize) {
      existingBytes = 0;
      try {
        if (fs.existsSync(partPath)) fs.unlinkSync(partPath);
      } catch {}
    }

    // Check if already completed
    if (totalSize > 0 && existingBytes >= totalSize) {
      if (fs.existsSync(partPath)) {
        fs.renameSync(partPath, finalPath);
      }
      onProgress({
        downloadedBytes: totalSize,
        totalSize,
        percentage: 100,
        speed: 0,
        eta: 0,
        rangeSupported,
      });
      return { finalPath, totalBytes: totalSize };
    }

    let startByte = 0;
    if (existingBytes > 0 && rangeSupported) {
      startByte = existingBytes;
    } else {
      existingBytes = 0;
      startByte = 0;
    }

    // 3. Request stream from server BEFORE opening writeStream
    let response: HttpResponse;
    try {
      response = await HttpClient.get(url, {
        rangeStart: startByte > 0 ? startByte : undefined,
        timeoutMs,
      });
    } catch (err: any) {
      this.cleanupStreams();
      throw err;
    }

    this.abortController = response.abort;

    let isAppend = false;
    let downloadedBytes = 0;

    if (response.statusCode === 206) {
      rangeSupported = true;
      isAppend = true;
      downloadedBytes = startByte;

      const contentRange = response.headers['content-range'];
      if (contentRange) {
        const match = contentRange.match(/\/(\d+|\*)$/);
        if (match && match[1] !== '*') {
          totalSize = parseInt(match[1], 10);
        }
      }
    } else if (response.statusCode === 200) {
      // Server returned full response (Range ignored or not supported)
      rangeSupported = false;
      isAppend = false;
      downloadedBytes = 0;
      const len = parseInt(response.headers['content-length'] || '0', 10);
      if (len > 0) totalSize = len;
    } else {
      this.cleanupStreams();
      const err: any = new Error(`HTTP error ${response.statusCode}`);
      err.statusCode = response.statusCode;
      err.headers = response.headers;
      throw err;
    }

    // 4. Open write stream safely with exact verified mode (append vs overwrite)
    try {
      this.writeStream = fs.createWriteStream(partPath, {
        flags: isAppend ? 'a' : 'w',
      });
    } catch (err: any) {
      this.cleanupStreams();
      throw new Error(RangeDownloader.mapDiskError(err));
    }

    let lastProgressTime = Date.now();
    let bytesSinceLastProgress = 0;
    let speed = 0;

    return new Promise<{ finalPath: string; totalBytes: number }>((resolve, reject) => {
      this.rejectCurrentPromise = reject;

      const triggerProgress = (force: boolean = false) => {
        const now = Date.now();
        const elapsed = now - lastProgressTime;

        if (force || elapsed >= 200) {
          const currentSpeed = elapsed > 0 ? (bytesSinceLastProgress / elapsed) * 1000 : 0;
          speed = speed === 0 ? currentSpeed : Math.round(speed * 0.7 + currentSpeed * 0.3);
          bytesSinceLastProgress = 0;
          lastProgressTime = now;

          const percentage = totalSize > 0 ? Math.min(100, Math.round((downloadedBytes / totalSize) * 10000) / 100) : 0;
          const remainingBytes = Math.max(0, totalSize - downloadedBytes);
          const eta = speed > 0 ? Math.ceil(remainingBytes / speed) : 0;

          onProgress({
            downloadedBytes,
            totalSize,
            percentage,
            speed,
            eta,
            rangeSupported,
          });
        }
      };

      const onData = (chunk: Buffer) => {
        if (this.isPaused || this.isCancelled) return;

        downloadedBytes += chunk.length;
        bytesSinceLastProgress += chunk.length;
        triggerProgress(false);
      };

      response.stream.on('data', onData);

      response.stream.on('error', (err: any) => {
        this.cleanupStreams();
        if (this.isPaused) {
          return reject(new Error('PAUSED'));
        }
        if (this.isCancelled) {
          return reject(new Error('CANCELLED'));
        }
        reject(err);
      });

      this.writeStream?.on('error', (err: any) => {
        this.cleanupStreams();
        reject(new Error(RangeDownloader.mapDiskError(err)));
      });

      response.stream.pipe(this.writeStream!);

      this.writeStream?.on('finish', () => {
        this.cleanupStreams();

        if (this.isPaused) {
          return reject(new Error('PAUSED'));
        }
        if (this.isCancelled) {
          return reject(new Error('CANCELLED'));
        }

        // Integrity verification: Check if stream prematurely closed before receiving all bytes
        if (totalSize > 0 && downloadedBytes < totalSize) {
          const prematureErr: any = new Error(
            `Connection closed prematurely: received ${downloadedBytes} of ${totalSize} bytes`
          );
          prematureErr.code = 'ECONNRESET';
          return reject(prematureErr);
        }

        // Finalize: Rename .part to finalPath
        try {
          if (fs.existsSync(partPath)) {
            fs.renameSync(partPath, finalPath);
          }
        } catch (renameErr: any) {
          return reject(new Error(RangeDownloader.mapDiskError(renameErr)));
        }

        triggerProgress(true);

        resolve({ finalPath, totalBytes: downloadedBytes });
      });
    });
  }

  pause(): void {
    this.isPaused = true;
    if (this.abortController) {
      this.abortController();
    }
    this.cleanupStreams();
    if (this.rejectCurrentPromise) {
      const reject = this.rejectCurrentPromise;
      this.rejectCurrentPromise = null;
      reject(new Error('PAUSED'));
    }
  }

  cancel(): void {
    this.isCancelled = true;
    if (this.abortController) {
      this.abortController();
    }
    this.cleanupStreams();
    if (this.rejectCurrentPromise) {
      const reject = this.rejectCurrentPromise;
      this.rejectCurrentPromise = null;
      reject(new Error('CANCELLED'));
    }
  }

  private cleanupStreams(): void {
    if (this.writeStream && !this.writeStream.destroyed) {
      this.writeStream.end();
      this.writeStream = null;
    }
    this.abortController = null;
  }
}
