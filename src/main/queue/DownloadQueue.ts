import { DownloadItem, DownloadStatus } from '../../shared/types/download';
import { AppSettings } from '../../shared/types/settings';
import { DownloadTask } from '../downloader/DownloadTask';
import { DownloadRepository } from '../storage/downloadRepository';

export interface QueueCallbacks {
  onProgress: (item: DownloadItem) => void;
  onStatusChange: (item: DownloadItem) => void;
  onQueueUpdated: (items: DownloadItem[]) => void;
  onComplete?: (item: DownloadItem) => void;
}

export class DownloadQueue {
  private tasks: Map<string, DownloadTask> = new Map();
  private repository: DownloadRepository;
  private settings: AppSettings;
  private callbacks: QueueCallbacks;
  private activeCount: number = 0;
  private isProcessing: boolean = false;

  constructor(repository: DownloadRepository, settings: AppSettings, callbacks: QueueCallbacks) {
    this.repository = repository;
    this.settings = settings;
    this.callbacks = callbacks;
  }

  updateSettings(newSettings: AppSettings): void {
    this.settings = newSettings;
    for (const task of this.tasks.values()) {
      task.updateSettings(newSettings);
    }
    // If concurrency increased, trigger queue processing
    this.processQueue();
  }

  private lastDbSaveTime: Map<string, number> = new Map();

  addTask(item: DownloadItem): DownloadTask {
    const task = new DownloadTask(item, this.settings, {
      onProgress: (updated) => {
        const now = Date.now();
        const lastSave = this.lastDbSaveTime.get(updated.id) || 0;
        if (now - lastSave >= 1000 || updated.percentage >= 100) {
          this.lastDbSaveTime.set(updated.id, now);
          this.repository.updateProgress(updated);
        }
        this.callbacks.onProgress(updated);
      },
      onStatusChange: (updated) => {
        this.repository.updateStatus(
          updated.id,
          updated.status,
          updated.error,
          updated.retryAt ? { reason: updated.waitingReason || '', retryAt: updated.retryAt } : undefined,
          updated.completedAt
        );
        this.callbacks.onStatusChange(updated);
        this.broadcastQueue();
      },
      onComplete: (updated) => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.repository.addToHistory(updated);
        if (this.callbacks.onComplete) {
          this.callbacks.onComplete(updated);
        }
        this.broadcastQueue();
        this.processQueue();
      },
      onError: (_updated) => {
        this.activeCount = Math.max(0, this.activeCount - 1);
        this.broadcastQueue();
        this.processQueue();
      },
    });

    this.tasks.set(item.id, task);
    this.repository.saveDownload(item);
    this.broadcastQueue();
    this.processQueue();
    return task;
  }

  getTask(id: string): DownloadTask | undefined {
    return this.tasks.get(id);
  }

  getAllItems(): DownloadItem[] {
    const list: DownloadItem[] = [];
    for (const task of this.tasks.values()) {
      list.push(task.item);
    }
    return list.sort((a, b) => a.queueOrder - b.queueOrder);
  }

  pauseTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.item.status === 'Downloading' || task.item.status === 'Waiting') {
      task.pause();
      this.activeCount = Math.max(0, this.activeCount - 1);
      this.processQueue();
      return true;
    } else if (task.item.status === 'Queued') {
      task.item.status = 'Paused';
      this.repository.updateStatus(id, 'Paused');
      this.callbacks.onStatusChange(task.item);
      this.broadcastQueue();
      return true;
    }
    return false;
  }

  resumeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    if (task.item.status === 'Paused' || task.item.status === 'Failed' || task.item.status === 'Cancelled') {
      task.resume();
      this.broadcastQueue();
      this.processQueue();
      return true;
    }
    return false;
  }

  cancelTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    const wasActive = task.item.status === 'Downloading' || task.item.status === 'Waiting';
    task.cancel();
    if (wasActive) {
      this.activeCount = Math.max(0, this.activeCount - 1);
    }
    this.broadcastQueue();
    this.processQueue();
    return true;
  }

  retryTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (!task) return false;

    task.retry();
    this.broadcastQueue();
    this.processQueue();
    return true;
  }

  removeTask(id: string): boolean {
    const task = this.tasks.get(id);
    if (task) {
      if (task.item.status === 'Downloading' || task.item.status === 'Waiting') {
        task.cancel();
        this.activeCount = Math.max(0, this.activeCount - 1);
      }
    }
    this.tasks.delete(id);
    this.repository.delete(id);
    this.broadcastQueue();
    this.processQueue();
    return true;
  }

  reorder(id: string, newIndex: number): boolean {
    const items = this.getAllItems();
    const currentIndex = items.findIndex((i) => i.id === id);
    if (currentIndex === -1 || newIndex < 0 || newIndex >= items.length) {
      return false;
    }

    const [moved] = items.splice(currentIndex, 1);
    items.splice(newIndex, 0, moved);

    const orderUpdates = items.map((item, idx) => {
      item.queueOrder = idx;
      const t = this.tasks.get(item.id);
      if (t) t.item.queueOrder = idx;
      return { id: item.id, queueOrder: idx };
    });

    this.repository.updateQueueOrders(orderUpdates);
    this.broadcastQueue();
    return true;
  }

  processQueue(): void {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const maxConcurrency = Math.min(5, Math.max(1, this.settings.concurrency));

      while (this.activeCount < maxConcurrency) {
        // Find next queued task
        const queuedItems = this.getAllItems().filter((item) => item.status === 'Queued');
        if (queuedItems.length === 0) break;

        const nextItem = queuedItems[0];
        const nextTask = this.tasks.get(nextItem.id);
        if (!nextTask) break;

        this.activeCount++;
        // Start task asynchronously
        nextTask.start().catch((err) => {
          console.error(`[DownloadQueue] Error executing task ${nextItem.id}:`, err);
          this.activeCount = Math.max(0, this.activeCount - 1);
          this.processQueue();
        });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  broadcastQueue(): void {
    const items = this.getAllItems();
    this.callbacks.onQueueUpdated(items);
  }
}
