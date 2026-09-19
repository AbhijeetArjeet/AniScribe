import path from 'path';
import fs from 'fs';
import { DownloadItem, DownloadStatus } from '../../shared/types/download';
import { AppSettings } from '../../shared/types/settings';
import { RangeDownloader } from './RangeDownloader';
import { RetryManager } from './RetryManager';

export interface DownloadTaskCallbacks {
  onProgress: (item: DownloadItem) => void;
  onStatusChange: (item: DownloadItem) => void;
  onComplete: (item: DownloadItem) => void;
  onError: (item: DownloadItem, error: string) => void;
}

export class DownloadTask {
  public item: DownloadItem;
  private settings: AppSettings;
  private callbacks: DownloadTaskCallbacks;
  private downloader: RangeDownloader | null = null;
  private retryManager: RetryManager = new RetryManager();
  private isAborted: boolean = false;

  constructor(item: DownloadItem, settings: AppSettings, callbacks: DownloadTaskCallbacks) {
    this.item = item;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  updateSettings(settings: AppSettings): void {
    this.settings = settings;
  }

  async start(): Promise<void> {
    if (this.item.status === 'Completed') return;
    this.isAborted = false;

    this.setStatus('Downloading');

    // Ensure safe filename if starting fresh
    if (this.item.downloadedBytes === 0) {
      const safeFilename = RangeDownloader.getSafeFilename(
        this.item.destination,
        this.item.filename,
        this.settings.overwriteExisting
      );
      this.item.filename = safeFilename;
    }

    this.downloader = new RangeDownloader();

    try {
      await this.downloader.start({
        url: this.item.url,
        destinationDir: this.item.destination,
        filename: this.item.filename,
        expectedTotalSize: this.item.totalSize,
        timeoutMs: this.settings.connectionTimeoutMs,
        overwrite: this.settings.overwriteExisting,
        onProgress: (prog) => {
          this.item.downloadedBytes = prog.downloadedBytes;
          this.item.totalSize = prog.totalSize;
          this.item.percentage = prog.percentage;
          this.item.speed = prog.speed;
          this.item.eta = prog.eta;
          this.item.rangeSupported = prog.rangeSupported;
          this.callbacks.onProgress(this.item);
        },
      });

      this.item.status = 'Completed';
      this.item.percentage = 100;
      this.item.speed = 0;
      this.item.eta = 0;
      this.item.completedAt = Date.now();
      this.callbacks.onStatusChange(this.item);
      this.callbacks.onComplete(this.item);
    } catch (err: any) {
      if (err.message === 'PAUSED') {
        this.setStatus('Paused');
        return;
      }
      if (err.message === 'CANCELLED') {
        this.setStatus('Cancelled');
        return;
      }

      console.warn(`[DownloadTask ${this.item.id}] Error:`, err.message);

      // Evaluate retry
      const plan = RetryManager.calculatePlan(
        err,
        this.item.retryCount,
        this.settings.maxRetries,
        this.settings.retryDelayMs
      );

      if (plan.shouldRetry && plan.retryAt) {
        this.item.retryCount += 1;
        this.item.retryAt = plan.retryAt;
        this.item.waitingReason = plan.reason || 'Server requested a retry';
        this.setStatus('Waiting');

        const resumed = await this.retryManager.waitForRetry(
          plan.retryAt,
          this.item.waitingReason,
          (secondsLeft, reason) => {
            this.item.waitingReason = `${reason} (Waiting: ${secondsLeft}s)`;
            this.callbacks.onStatusChange(this.item);
          }
        );

        if (resumed && !this.isAborted) {
          this.item.retryAt = undefined;
          this.item.waitingReason = undefined;
          return this.start();
        }
      } else {
        this.item.error = plan.reason || err.message || 'Download failed';
        this.item.speed = 0;
        this.item.eta = 0;
        this.setStatus('Failed');
        this.callbacks.onError(this.item, this.item.error!);
      }
    }
  }

  pause(): void {
    this.isAborted = true;
    this.retryManager.cancel();
    if (this.downloader) {
      this.downloader.pause();
    }
    this.setStatus('Paused');
  }

  resume(): void {
    this.isAborted = false;
    this.item.error = undefined;
    this.item.waitingReason = undefined;
    this.item.retryAt = undefined;
    this.setStatus('Queued');
  }

  cancel(): void {
    this.isAborted = true;
    this.retryManager.cancel();
    if (this.downloader) {
      this.downloader.cancel();
    }

    // Clean up .part file if exists
    const partPath = path.join(this.item.destination, `${this.item.filename}.part`);
    try {
      if (fs.existsSync(partPath)) {
        fs.unlinkSync(partPath);
      }
    } catch {
      // ignore
    }

    this.setStatus('Cancelled');
  }

  retry(): void {
    this.isAborted = false;
    this.retryManager.cancel();
    this.item.retryCount = 0;
    this.item.error = undefined;
    this.item.waitingReason = undefined;
    this.item.retryAt = undefined;
    this.setStatus('Queued');
  }

  private setStatus(status: DownloadStatus): void {
    this.item.status = status;
    if (status !== 'Downloading') {
      this.item.speed = 0;
      this.item.eta = 0;
    }
    this.callbacks.onStatusChange(this.item);
  }
}
