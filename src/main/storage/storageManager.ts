import fs from 'fs';
import path from 'path';
import { IDatabase } from './database';
import { SettingsRepository } from './settingsRepository';
import { LibraryRepository } from '../library/libraryRepository';
import {
  StorageOverview,
  TitleStorageBreakdown,
  LargestMediaFile,
  MigrationResult,
} from '../../shared/types/storage';

export class StorageManager {
  private db: IDatabase;
  private settingsRepository: SettingsRepository;
  private libraryRepository: LibraryRepository;

  constructor(
    db: IDatabase,
    settingsRepository: SettingsRepository,
    libraryRepository: LibraryRepository
  ) {
    this.db = db;
    this.settingsRepository = settingsRepository;
    this.libraryRepository = libraryRepository;
  }

  getLibraryPath(): string {
    const settings = this.settingsRepository.getSettings();
    const base = settings.downloadDirectory || process.cwd();
    const libPath = path.join(base, 'Library');
    if (!fs.existsSync(libPath)) {
      try {
        fs.mkdirSync(libPath, { recursive: true });
      } catch {}
    }
    return libPath;
  }

  async getStorageOverview(): Promise<StorageOverview> {
    const libraryPath = this.getLibraryPath();

    // 1. Check disk space using fs.statfs if available
    let availableDiskSpaceBytes: number | undefined;
    let totalDiskCapacityBytes: number | undefined;

    try {
      if (typeof fs.statfsSync === 'function') {
        const stats = fs.statfsSync(libraryPath);
        availableDiskSpaceBytes = stats.bavail * stats.bsize;
        totalDiskCapacityBytes = stats.blocks * stats.bsize;
      }
    } catch {
      // Ignored if statfs not supported on platform
    }

    // 2. Query summary statistics from SQLite
    const countRow = this.db.prepare(`
      SELECT 
        (SELECT COUNT(*) FROM titles) AS title_count,
        (SELECT COUNT(*) FROM seasons) AS season_count,
        (SELECT COUNT(*) FROM episodes) AS episode_count,
        (SELECT COUNT(*) FROM media_files) AS media_count,
        (SELECT COALESCE(SUM(file_size), 0) FROM media_files) AS total_size
    `).get() as any;

    const totalTitles = Number(countRow?.title_count) || 0;
    const totalSeasons = Number(countRow?.season_count) || 0;
    const totalEpisodes = Number(countRow?.episode_count) || 0;
    const totalMediaFiles = Number(countRow?.media_count) || 0;
    const totalLibrarySizeBytes = Number(countRow?.total_size) || 0;

    // 3. Per-title breakdown
    const titles = this.libraryRepository.getAllTitles('all');
    const titleBreakdowns: TitleStorageBreakdown[] = titles.map((t) => {
      let titleBytes = 0;
      const seasonBreakdowns = t.seasons.map((s) => {
        let seasonBytes = 0;
        for (const ep of s.episodes) {
          if (ep.mediaFile) {
            seasonBytes += ep.mediaFile.fileSize;
          }
        }
        titleBytes += seasonBytes;
        return {
          seasonNumber: s.seasonNumber,
          totalBytes: seasonBytes,
          episodeCount: s.episodes.length,
        };
      });

      return {
        id: t.id,
        titleName: t.name,
        totalBytes: titleBytes,
        episodeCount: t.totalEpisodes,
        downloadedCount: t.downloadedEpisodes,
        seasons: seasonBreakdowns,
      };
    });

    titleBreakdowns.sort((a, b) => b.totalBytes - a.totalBytes);

    // 4. Largest media files (top 15)
    const largestStmt = this.db.prepare(`
      SELECT m.id, m.file_path, m.file_size, m.resolution, m.download_date,
             e.name AS ep_name, e.episode_number, s.season_number, t.name AS title_name
      FROM media_files m
      JOIN episodes e ON m.episode_id = e.id
      JOIN seasons s ON e.season_id = s.id
      JOIN titles t ON e.title_id = t.id
      ORDER BY m.file_size DESC
      LIMIT 15
    `);
    const largestRows = largestStmt.all() as any[];

    const largestFiles: LargestMediaFile[] = largestRows.map((r) => ({
      id: r.id,
      filePath: r.file_path,
      fileName: path.basename(r.file_path),
      fileSizeBytes: Number(r.file_size) || 0,
      titleName: r.title_name,
      episodeName: r.ep_name,
      seasonNumber: Number(r.season_number) || 1,
      episodeNumber: Number(r.episode_number) || 1,
      resolution: r.resolution || undefined,
      downloadDate: Number(r.download_date) || Date.now(),
    }));

    return {
      libraryPath,
      totalLibrarySizeBytes,
      availableDiskSpaceBytes,
      totalDiskCapacityBytes,
      totalTitles,
      totalSeasons,
      totalEpisodes,
      totalMediaFiles,
      titleBreakdowns,
      largestFiles,
    };
  }

  async deleteWatchedEpisodes(titleId?: string): Promise<number> {
    let query = `
      SELECT m.id, m.file_path
      FROM media_files m
      JOIN watch_progress w ON m.episode_id = w.episode_id
      WHERE w.is_completed = 1
    `;
    const params: any[] = [];
    if (titleId) {
      query += ' AND w.title_id = ?';
      params.push(titleId);
    }

    const rows = this.db.prepare(query).all(...params) as any[];
    let deletedCount = 0;

    for (const r of rows) {
      if (r.file_path && fs.existsSync(r.file_path)) {
        try {
          fs.unlinkSync(r.file_path);
        } catch (e) {
          console.warn(`[StorageManager] Could not delete watched file: ${r.file_path}`, e);
        }
      }
      this.libraryRepository.deleteMediaFile(r.id, false);
      deletedCount++;
    }

    return deletedCount;
  }

  async migrateLibraryLocation(newParentPath: string, moveFiles: boolean): Promise<MigrationResult> {
    if (!newParentPath || !newParentPath.trim()) {
      return { success: false, movedCount: 0, error: 'Destination path is required.' };
    }

    const targetLibDir = path.join(newParentPath, 'Library');
    if (!fs.existsSync(targetLibDir)) {
      fs.mkdirSync(targetLibDir, { recursive: true });
    }

    const currentLibDir = this.getLibraryPath();
    if (path.resolve(currentLibDir) === path.resolve(targetLibDir)) {
      return { success: true, movedCount: 0 };
    }

    const mediaRows = this.db.prepare('SELECT id, file_path, file_size FROM media_files').all() as any[];
    let movedCount = 0;

    for (const row of mediaRows) {
      const oldPath = path.normalize(row.file_path);
      if (!fs.existsSync(oldPath)) continue;

      // Calculate relative subpath inside old library directory
      let rel = path.relative(currentLibDir, oldPath);
      if (rel.startsWith('..') || path.isAbsolute(rel)) {
        // Not inside old library folder, copy into flat target
        rel = path.basename(oldPath);
      }

      const newPath = path.join(targetLibDir, rel);
      const newFolder = path.dirname(newPath);
      if (!fs.existsSync(newFolder)) {
        fs.mkdirSync(newFolder, { recursive: true });
      }

      try {
        if (moveFiles) {
          // Attempt atomic rename if on same drive, or copy + verify + unlink
          try {
            fs.renameSync(oldPath, newPath);
          } catch {
            fs.copyFileSync(oldPath, newPath);
            const newStat = fs.statSync(newPath);
            if (newStat.size === Number(row.file_size)) {
              fs.unlinkSync(oldPath);
            }
          }
        } else {
          fs.copyFileSync(oldPath, newPath);
        }

        // Verify and update path in SQLite
        if (fs.existsSync(newPath)) {
          this.db.prepare('UPDATE media_files SET file_path = ? WHERE id = ?').run(newPath, row.id);
          movedCount++;
        }
      } catch (err: any) {
        console.error(`[StorageManager] Failed to migrate file "${oldPath}":`, err.message);
      }
    }

    // Update settings with new download directory
    this.settingsRepository.saveSettings({
      downloadDirectory: newParentPath,
    });

    return { success: true, movedCount };
  }
}
