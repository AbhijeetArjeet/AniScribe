import { BrowserWindow, shell } from 'electron';
import { URL } from 'url';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { DownloadItem, DownloadProgress, DownloadStatus } from '../../shared/types/download';
import { AppSettings, TemplateContext } from '../../shared/types/settings';
import { DownloadRepository } from '../storage/downloadRepository';
import { SettingsRepository } from '../storage/settingsRepository';
import { DownloadQueue } from '../queue/DownloadQueue';
import { RangeDownloader } from './RangeDownloader';
import { extractFilenameFromUrl, probeMetadata } from '../network/RangeSupport';

export class DownloadManager {
  private repository: DownloadRepository;
  private settingsRepository: SettingsRepository;
  private windowGetter: () => BrowserWindow | null;
  private queue: DownloadQueue;
  private onDownloadComplete?: (item: DownloadItem) => Promise<void> | void;

  setOnDownloadComplete(handler: (item: DownloadItem) => Promise<void> | void): void {
    this.onDownloadComplete = handler;
  }

  constructor(
    repository: DownloadRepository,
    settingsRepository: SettingsRepository,
    windowGetter: () => BrowserWindow | null
  ) {
    this.repository = repository;
    this.settingsRepository = settingsRepository;
    this.windowGetter = windowGetter;

    const settings = this.settingsRepository.getSettings();

    this.queue = new DownloadQueue(this.repository, settings, {
      onProgress: (item) => this.sendIpc('downloads:progress', item),
      onStatusChange: (item) => {
        this.sendIpc('downloads:statusChange', {
          id: item.id,
          status: item.status,
          waiting: item.retryAt
            ? { reason: item.waitingReason || 'Server requested a retry', retryAt: item.retryAt }
            : undefined,
          error: item.error,
        });
      },
      onQueueUpdated: (items) => this.sendIpc('downloads:queueUpdated', items),
      onComplete: async (item) => {
        if (this.onDownloadComplete) {
          try {
            await this.onDownloadComplete(item);
          } catch (err) {
            console.error('[DownloadManager] Error in onDownloadComplete:', err);
          }
        }
      },
    });

    this.initFromDatabase();
  }

  private sendIpc(channel: string, payload: any): void {
    const win = this.windowGetter();
    if (win && !win.isDestroyed() && win.webContents) {
      win.webContents.send(channel, payload);
    }
  }

  private initFromDatabase(): void {
    // Reset unfinished downloads
    this.repository.resetUnfinishedOnStartup();

    const savedItems = this.repository.getAll();
    for (const item of savedItems) {
      this.queue.addTask(item);
    }
  }

  static validateUrl(rawUrl: string): { valid: boolean; error?: string; parsedUrl?: URL } {
    if (!rawUrl || typeof rawUrl !== 'string' || !rawUrl.trim()) {
      return { valid: false, error: 'URL is required' };
    }

    const trimmed = rawUrl.trim();
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return {
          valid: false,
          error: `Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are supported.`,
        };
      }
      return { valid: true, parsedUrl: parsed };
    } catch {
      return { valid: false, error: 'Invalid URL format' };
    }
  }

  async addUrls(urls: string[], templateContext?: TemplateContext): Promise<DownloadItem[]> {
    const addedItems: DownloadItem[] = [];
    const settings = this.settingsRepository.getSettings();
    const downloadDir = settings.downloadDirectory || process.cwd();

    const currentItems = this.queue.getAllItems();
    let highestOrder = currentItems.reduce((max: number, item: DownloadItem) => Math.max(max, item.queueOrder), -1);

    for (const rawUrl of urls) {
      const validation = DownloadManager.validateUrl(rawUrl);
      if (!validation.valid || !validation.parsedUrl) {
        throw new Error(validation.error || 'Invalid URL');
      }

      const id = crypto.randomUUID();
      const originalFilename = extractFilenameFromUrl(rawUrl);
      
      let filename = originalFilename;
      if (settings.filenameTemplate && templateContext) {
        filename = RangeDownloader.applyFilenameTemplate(settings.filenameTemplate, {
          ...templateContext,
          originalFilename,
        });
      }

      highestOrder++;

      const item: DownloadItem = {
        id,
        url: rawUrl.trim(),
        filename,
        hostname: validation.parsedUrl.hostname,
        destination: downloadDir,
        totalSize: 0,
        downloadedBytes: 0,
        percentage: 0,
        speed: 0,
        eta: 0,
        status: 'Queued',
        retryCount: 0,
        maxRetries: settings.maxRetries,
        rangeSupported: false,
        queueOrder: highestOrder,
        createdAt: Date.now(),
        title: templateContext?.title,
        episode: templateContext?.episode,
        quality: templateContext?.quality,
      };

      // Probe metadata in background or right before download
      try {
        const meta = await probeMetadata(item.url, 5000);
        if (meta.contentLength > 0) item.totalSize = meta.contentLength;
        if (meta.acceptRanges) item.rangeSupported = true;
        if (meta.suggestedFilename && !templateContext?.title) {
          item.filename = meta.suggestedFilename;
        }
      } catch {
        // probe failure is non-fatal; RangeDownloader will handle it
      }

      this.queue.addTask(item);
      addedItems.push(item);
    }

    return addedItems;
  }

  pause(id: string): boolean {
    return this.queue.pauseTask(id);
  }

  resume(id: string): boolean {
    return this.queue.resumeTask(id);
  }

  cancel(id: string): boolean {
    return this.queue.cancelTask(id);
  }

  retry(id: string): boolean {
    return this.queue.retryTask(id);
  }

  remove(id: string): boolean {
    return this.queue.removeTask(id);
  }

  getAll(): DownloadItem[] {
    return this.queue.getAllItems();
  }

  getById(id: string): DownloadItem | null {
    return this.queue.getAllItems().find((i) => i.id === id) || this.repository.getById(id) || null;
  }

  reorder(id: string, newIndex: number): boolean {
    return this.queue.reorder(id, newIndex);
  }

  updateSettings(settings: Partial<AppSettings>): AppSettings {
    const updated = this.settingsRepository.saveSettings(settings);
    this.queue.updateSettings(updated);
    return updated;
  }

  getSettings(): AppSettings {
    return this.settingsRepository.getSettings();
  }

  getHistory(): DownloadItem[] {
    return this.repository.getHistory();
  }

  clearHistory(): boolean {
    this.repository.clearHistory();
    return true;
  }

  deleteHistoryItem(id: string): boolean {
    this.repository.deleteHistoryItem(id);
    return true;
  }

  openFolder(filePath: string): boolean {
    try {
      if (fs.existsSync(filePath)) {
        shell.showItemInFolder(filePath);
        return true;
      }
      const dir = path.dirname(filePath);
      if (fs.existsSync(dir)) {
        shell.openPath(dir);
        return true;
      }
    } catch (err) {
      console.error('[DownloadManager] Failed to open path:', err);
    }
    return false;
  }

  dispose(): void {
    for (const item of this.queue.getAllItems()) {
      if (item.status === 'Downloading' || item.status === 'Waiting') {
        this.queue.cancelTask(item.id);
      }
    }
  }
}
