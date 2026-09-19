import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';
import { LibraryRepository } from '../library/libraryRepository';
import { IDatabase } from '../storage/database';
import {
  ExportJob,
  ExportItem,
  ExportRequestPayload,
  ExportStatus,
  CollisionResolution,
} from '../../shared/types/export';

export class ExportManager {
  private libraryRepository: LibraryRepository;
  private db: IDatabase;
  private activeJobs = new Map<string, ExportJob>();
  private abortControllers = new Map<string, AbortController>();
  private onProgressCallback?: (job: ExportJob) => void;
  private onStatusChangeCallback?: (job: ExportJob) => void;

  constructor(
    libraryRepository: LibraryRepository,
    db: IDatabase,
    onProgress?: (job: ExportJob) => void,
    onStatusChange?: (job: ExportJob) => void
  ) {
    this.libraryRepository = libraryRepository;
    this.db = db;
    this.onProgressCallback = onProgress;
    this.onStatusChangeCallback = onStatusChange;
  }

  getJobs(): ExportJob[] {
    return Array.from(this.activeJobs.values());
  }

  getJob(id: string): ExportJob | undefined {
    return this.activeJobs.get(id);
  }

  /**
   * Resolves collision for destination filename
   */
  static resolveCollision(destPath: string, mode: CollisionResolution): { finalPath: string; shouldSkip: boolean } {
    if (!fs.existsSync(destPath)) {
      return { finalPath: destPath, shouldSkip: false };
    }

    if (mode === 'replace') {
      return { finalPath: destPath, shouldSkip: false };
    }

    if (mode === 'skip') {
      return { finalPath: destPath, shouldSkip: true };
    }

    // Default: rename / keepBoth -> "video (1).mp4", "video (2).mp4"
    const dir = path.dirname(destPath);
    const ext = path.extname(destPath);
    const base = path.basename(destPath, ext);

    let counter = 1;
    let candidate = path.join(dir, `${base} (${counter})${ext}`);
    while (fs.existsSync(candidate)) {
      counter++;
      candidate = path.join(dir, `${base} (${counter})${ext}`);
    }

    return { finalPath: candidate, shouldSkip: false };
  }

  async startExport(payload: ExportRequestPayload): Promise<ExportJob> {
    const {
      mediaFileIds,
      destinationDir,
      createMobileFolders = true,
      collisionResolution = 'rename',
      isMove = false,
    } = payload;

    if (!mediaFileIds || mediaFileIds.length === 0) {
      throw new Error('No media files selected for export.');
    }

    if (!destinationDir || !destinationDir.trim()) {
      throw new Error('Destination directory is required.');
    }

    if (!fs.existsSync(destinationDir)) {
      fs.mkdirSync(destinationDir, { recursive: true });
    }

    const jobId = `export-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const items: ExportItem[] = [];
    let totalJobBytes = 0;

    for (const mediaId of mediaFileIds) {
      const mediaStmt = this.db.prepare(`
        SELECT m.*, e.name AS ep_name, e.episode_number, s.season_number, t.name AS title_name
        FROM media_files m
        JOIN episodes e ON m.episode_id = e.id
        JOIN seasons s ON e.season_id = s.id
        JOIN titles t ON e.title_id = t.id
        WHERE m.id = ?
      `);
      const row = mediaStmt.get(mediaId);
      if (!row || !row.file_path) continue;

      const sourcePath = path.normalize(row.file_path);
      if (!fs.existsSync(sourcePath)) {
        console.warn(`[ExportManager] Source media file missing on disk: ${sourcePath}`);
        continue;
      }

      const stat = fs.statSync(sourcePath);
      const titleName = row.title_name || 'Anime';
      const seasonNum = row.season_number || 1;
      const epNum = row.episode_number || 1;
      const originalFilename = path.basename(sourcePath);

      let targetFolder = destinationDir;
      if (createMobileFolders) {
        const safeTitle = titleName.replace(/[\\/:*?"<>|]/g, '_').trim();
        const seasonPad = String(seasonNum).padStart(2, '0');
        targetFolder = path.join(destinationDir, safeTitle, `Season ${seasonPad}`);
      }

      if (!fs.existsSync(targetFolder)) {
        fs.mkdirSync(targetFolder, { recursive: true });
      }

      const targetPath = path.join(targetFolder, originalFilename);
      const { finalPath, shouldSkip } = ExportManager.resolveCollision(targetPath, collisionResolution);

      const item: ExportItem = {
        id: `exp-item-${crypto.randomBytes(6).toString('hex')}`,
        sourceFilePath: sourcePath,
        destinationFilePath: finalPath,
        titleName,
        seasonNumber: seasonNum,
        episodeNumber: epNum,
        episodeName: row.ep_name,
        fileSizeBytes: stat.size,
        copiedBytes: shouldSkip ? stat.size : 0,
        percentage: shouldSkip ? 100 : 0,
        speed: 0,
        eta: 0,
        status: shouldSkip ? 'Completed' : 'Queued',
        createdAt: Date.now(),
      };

      totalJobBytes += stat.size;
      items.push(item);
    }

    if (items.length === 0) {
      throw new Error('None of the selected media files could be located on disk for export.');
    }

    const job: ExportJob = {
      id: jobId,
      items,
      destinationDir,
      createMobileFolders,
      collisionResolution,
      includeSubtitles: payload.includeSubtitles ?? true,
      totalBytes: totalJobBytes,
      copiedBytes: 0,
      overallPercentage: 0,
      status: 'Queued',
      currentFileIndex: 0,
      createdAt: Date.now(),
    };

    this.activeJobs.set(jobId, job);
    this.recordJobInDatabase(job);

    // Start background processing
    const abortController = new AbortController();
    this.abortControllers.set(jobId, abortController);
    this.processJob(job, isMove, abortController.signal).catch((err) => {
      console.error(`[ExportManager] Job ${jobId} failed:`, err);
    });

    return job;
  }

  private async processJob(job: ExportJob, isMove: boolean, signal: AbortSignal): Promise<void> {
    job.status = 'Copying';
    this.notifyStatusChange(job);

    let cumulativeCopiedBeforeCurrent = 0;

    for (let i = 0; i < job.items.length; i++) {
      if (signal.aborted) {
        job.status = 'Cancelled';
        this.notifyStatusChange(job);
        return;
      }

      job.currentFileIndex = i;
      const item = job.items[i];

      if (item.status === 'Completed') {
        cumulativeCopiedBeforeCurrent += item.fileSizeBytes;
        continue;
      }

      item.status = 'Copying';
      this.notifyStatusChange(job);

      const partFile = `${item.destinationFilePath}.bfexport`;
      let lastBytes = 0;
      let lastTime = Date.now();

      try {
        const readStream = fs.createReadStream(item.sourceFilePath);
        const writeStream = fs.createWriteStream(partFile);

        const progressTracker = new Transform({
          transform: (chunk, _encoding, callback) => {
            if (signal.aborted) {
              callback(new Error('Export aborted by user'));
              return;
            }
            item.copiedBytes += chunk.length;
            const now = Date.now();
            const elapsed = (now - lastTime) / 1000;

            if (elapsed >= 0.5) {
              const bytesDiff = item.copiedBytes - lastBytes;
              item.speed = Math.round(bytesDiff / elapsed);
              const remaining = item.fileSizeBytes - item.copiedBytes;
              item.eta = item.speed > 0 ? Math.round(remaining / item.speed) : 0;
              item.percentage = item.fileSizeBytes > 0
                ? Math.min(100, Math.round((item.copiedBytes / item.fileSizeBytes) * 100))
                : 100;

              job.copiedBytes = cumulativeCopiedBeforeCurrent + item.copiedBytes;
              job.overallPercentage = job.totalBytes > 0
                ? Math.min(100, Math.round((job.copiedBytes / job.totalBytes) * 100))
                : 100;

              lastBytes = item.copiedBytes;
              lastTime = now;
              this.notifyProgress(job);
            }
            callback(null, chunk);
          },
        });

        await pipeline(readStream, progressTracker, writeStream, { signal });

        // Atomic rename of completed part file
        if (fs.existsSync(partFile)) {
          if (fs.existsSync(item.destinationFilePath)) {
            fs.unlinkSync(item.destinationFilePath);
          }
          fs.renameSync(partFile, item.destinationFilePath);
        }

        item.status = 'Completed';
        item.copiedBytes = item.fileSizeBytes;
        item.percentage = 100;
        item.completedAt = Date.now();

        // Copy matching subtitle files alongside video if includeSubtitles is enabled
        if (job.includeSubtitles !== false) {
          try {
            const srcDir = path.dirname(item.sourceFilePath);
            const srcBase = path.basename(item.sourceFilePath, path.extname(item.sourceFilePath));
            const dstDir = path.dirname(item.destinationFilePath);
            const dstBase = path.basename(item.destinationFilePath, path.extname(item.destinationFilePath));

            for (const subExt of ['.en.srt', '.ja.srt', '.srt', '.en.vtt', '.vtt']) {
              const srcSub = path.join(srcDir, `${srcBase}${subExt}`);
              if (fs.existsSync(srcSub)) {
                const dstSub = path.join(dstDir, `${dstBase}${subExt}`);
                fs.copyFileSync(srcSub, dstSub);
              }
            }
          } catch (subErr) {
            console.warn('[ExportManager] Note on subtitle export:', subErr);
          }
        }

        // Handle move if requested
        if (isMove) {
          try {
            fs.unlinkSync(item.sourceFilePath);
            this.db.prepare('UPDATE media_files SET file_path = ? WHERE file_path = ?').run(
              item.destinationFilePath,
              item.sourceFilePath
            );
          } catch (e) {
            console.warn('[ExportManager] Could not delete original file in move mode:', e);
          }
        }

        cumulativeCopiedBeforeCurrent += item.fileSizeBytes;
      } catch (err: any) {
        if (fs.existsSync(partFile)) {
          try {
            fs.unlinkSync(partFile);
          } catch {}
        }

        if (signal.aborted) {
          item.status = 'Cancelled';
          job.status = 'Cancelled';
          this.notifyStatusChange(job);
          this.updateJobInDatabase(job);
          return;
        }

        item.status = 'Failed';
        item.error = err.message || 'Export error';
        console.error(`[ExportManager] Failed to export "${item.sourceFilePath}":`, err);
      }
    }

    const hasFailed = job.items.some((it) => it.status === 'Failed');
    const hasCancelled = job.items.some((it) => it.status === 'Cancelled');

    if (hasCancelled) {
      job.status = 'Cancelled';
    } else if (hasFailed) {
      job.status = 'Failed';
    } else {
      job.status = 'Completed';
      job.overallPercentage = 100;
      job.copiedBytes = job.totalBytes;
      job.completedAt = Date.now();
    }

    this.notifyStatusChange(job);
    this.updateJobInDatabase(job);
  }

  cancelExport(jobId: string): boolean {
    const controller = this.abortControllers.get(jobId);
    const job = this.activeJobs.get(jobId);
    if (!job) return false;

    if (controller) {
      controller.abort();
      this.abortControllers.delete(jobId);
    }

    job.status = 'Cancelled';
    for (const item of job.items) {
      if (item.status === 'Copying' || item.status === 'Queued') {
        item.status = 'Cancelled';
      }
    }

    this.notifyStatusChange(job);
    this.updateJobInDatabase(job);
    return true;
  }

  private notifyProgress(job: ExportJob): void {
    if (this.onProgressCallback) {
      this.onProgressCallback(job);
    }
  }

  private notifyStatusChange(job: ExportJob): void {
    if (this.onStatusChangeCallback) {
      this.onStatusChangeCallback(job);
    }
  }

  private recordJobInDatabase(job: ExportJob): void {
    try {
      const stmt = this.db.prepare(`
        INSERT OR REPLACE INTO exports (
          id, source_media_id, source_path, destination_path, status, total_bytes, copied_bytes, error, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of job.items) {
        stmt.run(
          item.id,
          null,
          item.sourceFilePath,
          item.destinationFilePath,
          item.status,
          item.fileSizeBytes,
          item.copiedBytes,
          item.error || null,
          item.createdAt
        );
      }
    } catch (err) {
      console.warn('[ExportManager] Failed to record export in database:', err);
    }
  }

  private updateJobInDatabase(job: ExportJob): void {
    try {
      const stmt = this.db.prepare(`
        UPDATE exports
        SET status = ?, copied_bytes = ?, error = ?, completed_at = ?
        WHERE id = ?
      `);
      for (const item of job.items) {
        stmt.run(
          item.status,
          item.copiedBytes,
          item.error || null,
          item.completedAt || Date.now(),
          item.id
        );
      }
    } catch (err) {
      console.warn('[ExportManager] Failed to update export in database:', err);
    }
  }
}
