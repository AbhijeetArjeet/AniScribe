import { IDatabase, getDatabase } from './database';
import { DownloadItem, DownloadProgress, DownloadStatus } from '../../shared/types/download';

export class DownloadRepository {
  private db: IDatabase;

  constructor(db?: IDatabase) {
    this.db = db || getDatabase();
  }

  private mapRowToItem(row: any): DownloadItem {
    return {
      id: row.id,
      url: row.url,
      filename: row.filename,
      hostname: row.hostname,
      destination: row.destination,
      totalSize: Number(row.total_size) || 0,
      downloadedBytes: Number(row.downloaded_bytes) || 0,
      percentage: Number(row.percentage) || 0,
      speed: Number(row.speed) || 0,
      eta: Number(row.eta) || 0,
      status: row.status as DownloadStatus,
      error: row.error || undefined,
      retryCount: Number(row.retry_count) || 0,
      maxRetries: Number(row.max_retries) || 3,
      retryAt: row.retry_at ? Number(row.retry_at) : undefined,
      waitingReason: row.waiting_reason || undefined,
      rangeSupported: Boolean(row.range_supported),
      queueOrder: Number(row.queue_order) || 0,
      createdAt: Number(row.created_at) || Date.now(),
      completedAt: row.completed_at ? Number(row.completed_at) : undefined,
      title: row.title || undefined,
      episode: row.episode || undefined,
      quality: row.quality || undefined,
    };
  }

  saveDownload(item: DownloadItem): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO downloads (
        id, url, filename, hostname, destination,
        total_size, downloaded_bytes, percentage, speed, eta,
        status, error, retry_count, max_retries, retry_at, waiting_reason,
        range_supported, queue_order, created_at, completed_at,
        title, episode, quality
      ) VALUES (
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?
      )
    `);

    stmt.run(
      item.id,
      item.url,
      item.filename,
      item.hostname,
      item.destination,
      item.totalSize,
      item.downloadedBytes,
      item.percentage,
      item.speed,
      item.eta,
      item.status,
      item.error || null,
      item.retryCount,
      item.maxRetries,
      item.retryAt || null,
      item.waitingReason || null,
      item.rangeSupported ? 1 : 0,
      item.queueOrder,
      item.createdAt,
      item.completedAt || null,
      item.title || null,
      item.episode || null,
      item.quality || null
    );
  }

  updateProgress(progress: DownloadProgress): void {
    const stmt = this.db.prepare(`
      UPDATE downloads SET
        downloaded_bytes = ?,
        total_size = ?,
        percentage = ?,
        speed = ?,
        eta = ?,
        status = ?,
        retry_count = ?,
        error = ?,
        retry_at = ?,
        waiting_reason = ?,
        range_supported = ?
      WHERE id = ?
    `);

    stmt.run(
      progress.downloadedBytes,
      progress.totalSize,
      progress.percentage,
      progress.speed,
      progress.eta,
      progress.status,
      progress.retryCount,
      progress.error || null,
      progress.retryAt || null,
      progress.waitingReason || null,
      progress.rangeSupported ? 1 : 0,
      progress.id
    );
  }

  updateStatus(
    id: string,
    status: DownloadStatus,
    error?: string,
    waiting?: { reason: string; retryAt: number },
    completedAt?: number
  ): void {
    const stmt = this.db.prepare(`
      UPDATE downloads SET
        status = ?,
        error = ?,
        waiting_reason = ?,
        retry_at = ?,
        completed_at = COALESCE(?, completed_at)
      WHERE id = ?
    `);

    stmt.run(
      status,
      error || null,
      waiting?.reason || null,
      waiting?.retryAt || null,
      completedAt || null,
      id
    );
  }

  getById(id: string): DownloadItem | null {
    const stmt = this.db.prepare('SELECT * FROM downloads WHERE id = ?');
    const row = stmt.get(id);
    return row ? this.mapRowToItem(row) : null;
  }

  getAll(): DownloadItem[] {
    const stmt = this.db.prepare('SELECT * FROM downloads ORDER BY queue_order ASC, created_at ASC');
    const rows = stmt.all();
    return rows.map((r) => this.mapRowToItem(r));
  }

  delete(id: string): void {
    const stmt = this.db.prepare('DELETE FROM downloads WHERE id = ?');
    stmt.run(id);
  }

  updateQueueOrders(items: { id: string; queueOrder: number }[]): void {
    if (items.length === 0) return;
    this.db.exec('BEGIN TRANSACTION');
    try {
      const stmt = this.db.prepare('UPDATE downloads SET queue_order = ? WHERE id = ?');
      for (const item of items) {
        stmt.run(item.queueOrder, item.id);
      }
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  resetUnfinishedOnStartup(): void {
    // If the app crashed or restarted while downloading, move them back to 'Queued'
    const stmt = this.db.prepare(`
      UPDATE downloads
      SET status = 'Queued', speed = 0, eta = 0
      WHERE status = 'Downloading' OR status = 'Waiting'
    `);
    stmt.run();
  }

  // History methods
  addToHistory(item: DownloadItem): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO history (
        id, download_id, filename, url, destination,
        total_size, status, created_at, completed_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      item.id,
      item.id,
      item.filename,
      item.url,
      item.destination,
      item.totalSize,
      item.status,
      item.createdAt,
      item.completedAt || Date.now()
    );
  }

  getHistory(): DownloadItem[] {
    const stmt = this.db.prepare('SELECT * FROM history ORDER BY completed_at DESC');
    const rows = stmt.all();
    return rows.map((r: any) => ({
      id: r.id,
      url: r.url,
      filename: r.filename,
      hostname: (() => {
        try {
          return new URL(r.url).hostname;
        } catch {
          return '';
        }
      })(),
      destination: r.destination,
      totalSize: Number(r.total_size) || 0,
      downloadedBytes: Number(r.total_size) || 0,
      percentage: 100,
      speed: 0,
      eta: 0,
      status: r.status as DownloadStatus,
      retryCount: 0,
      maxRetries: 3,
      rangeSupported: true,
      queueOrder: 0,
      createdAt: Number(r.created_at) || Date.now(),
      completedAt: Number(r.completed_at) || Date.now(),
    }));
  }

  clearHistory(): void {
    const stmt = this.db.prepare('DELETE FROM history');
    stmt.run();
  }

  deleteHistoryItem(id: string): void {
    const stmt = this.db.prepare('DELETE FROM history WHERE id = ?');
    stmt.run(id);
  }
}
