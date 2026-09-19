import fs from 'fs';
import crypto from 'crypto';
import { IDatabase, getDatabase } from '../storage/database';
import {
  Title,
  Season,
  Episode,
  MediaFile,
  WatchProgress,
  LibraryTitle,
  LibrarySeason,
  LibraryEpisode,
  LibraryFilter,
} from '../../shared/types/library';

export class LibraryRepository {
  private db: IDatabase;

  constructor(db?: IDatabase) {
    this.db = db || getDatabase();
  }

  upsertTitle(title: Title): Title {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO titles (
        id, name, original_name, description, poster_path, backdrop_path, authorized_source, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      title.id,
      title.name,
      title.originalName || null,
      title.description || null,
      title.posterPath || null,
      title.backdropPath || null,
      title.authorizedSource,
      title.createdAt || Date.now()
    );
    return title;
  }

  getTitles(filter?: LibraryFilter, search?: string): LibraryTitle[] {
    return this.getAllTitles(filter, search);
  }

  upsertSeason(season: Season): Season {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO seasons (
        id, title_id, season_number, name, episode_count
      ) VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      season.id,
      season.titleId,
      season.seasonNumber,
      season.name,
      season.episodeCount
    );
    return season;
  }

  upsertEpisode(episode: Episode): Episode {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO episodes (
        id, season_id, title_id, episode_number, name, duration_seconds, thumbnail_path
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      episode.id,
      episode.seasonId,
      episode.titleId,
      episode.episodeNumber,
      episode.name,
      episode.durationSeconds || null,
      episode.thumbnailPath || null
    );
    return episode;
  }

  upsertMediaFile(mediaFile: MediaFile): MediaFile {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO media_files (
        id, episode_id, file_path, file_size, format, resolution, audio_track, download_date, verified
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      mediaFile.id,
      mediaFile.episodeId,
      mediaFile.filePath,
      mediaFile.fileSize,
      mediaFile.format,
      mediaFile.resolution || null,
      mediaFile.audioTrack || null,
      mediaFile.downloadDate,
      mediaFile.verified ? 1 : 0
    );
    return mediaFile;
  }

  saveWatchProgress(
    progressOrEpisodeId: WatchProgress | string,
    titleId?: string,
    positionSeconds?: number,
    durationSeconds?: number
  ): WatchProgress {
    let progress: WatchProgress;
    if (typeof progressOrEpisodeId === 'string') {
      const episodeId = progressOrEpisodeId;
      const dur = durationSeconds || 0;
      const pos = positionSeconds || 0;
      const isCompleted = dur > 0 && pos >= dur * 0.9;
      progress = {
        id: `wp-${crypto.createHash('md5').update(episodeId).digest('hex').slice(0, 12)}`,
        episodeId,
        titleId: titleId || '',
        positionSeconds: pos,
        durationSeconds: dur,
        isCompleted,
        lastWatchedAt: Date.now(),
      };
    } else {
      progress = progressOrEpisodeId;
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO watch_progress (
        id, episode_id, title_id, position_seconds, duration_seconds, is_completed, last_watched_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      progress.id,
      progress.episodeId,
      progress.titleId,
      progress.positionSeconds,
      progress.durationSeconds,
      progress.isCompleted ? 1 : 0,
      progress.lastWatchedAt
    );
    return progress;
  }

  markEpisodeWatched(episodeId: string, titleId: string, watched: boolean): void {
    const existing = this.getWatchProgress(episodeId);
    const dur = existing?.durationSeconds || 1400;
    this.saveWatchProgress({
      id: `wp-${crypto.createHash('md5').update(episodeId).digest('hex').slice(0, 12)}`,
      episodeId,
      titleId,
      positionSeconds: watched ? dur : 0,
      durationSeconds: dur,
      isCompleted: Boolean(watched),
      lastWatchedAt: Date.now(),
    });
  }

  getWatchProgress(episodeId: string): WatchProgress | null {
    const stmt = this.db.prepare('SELECT * FROM watch_progress WHERE episode_id = ?');
    const row = stmt.get(episodeId);
    if (!row) return null;
    return {
      id: row.id,
      episodeId: row.episode_id,
      titleId: row.title_id,
      positionSeconds: Number(row.position_seconds) || 0,
      durationSeconds: Number(row.duration_seconds) || 0,
      isCompleted: Boolean(row.is_completed),
      lastWatchedAt: Number(row.last_watched_at) || Date.now(),
    };
  }

  getMediaFileByEpisodeId(episodeId: string): MediaFile | null {
    const stmt = this.db.prepare('SELECT * FROM media_files WHERE episode_id = ?');
    const row = stmt.get(episodeId);
    if (!row) return null;
    return {
      id: row.id,
      episodeId: row.episode_id,
      filePath: row.file_path,
      fileSize: Number(row.file_size) || 0,
      format: row.format,
      resolution: row.resolution || undefined,
      audioTrack: row.audio_track || undefined,
      downloadDate: Number(row.download_date) || Date.now(),
      verified: Boolean(row.verified),
    };
  }

  getMediaFileById(id: string): MediaFile | null {
    const stmt = this.db.prepare('SELECT * FROM media_files WHERE id = ?');
    const row = stmt.get(id);
    if (!row) return null;
    return {
      id: row.id,
      episodeId: row.episode_id,
      filePath: row.file_path,
      fileSize: Number(row.file_size) || 0,
      format: row.format,
      resolution: row.resolution || undefined,
      audioTrack: row.audio_track || undefined,
      downloadDate: Number(row.download_date) || Date.now(),
      verified: Boolean(row.verified),
    };
  }

  getTitle(id: string): LibraryTitle | null {
    const titleStmt = this.db.prepare('SELECT * FROM titles WHERE id = ?');
    const titleRow = titleStmt.get(id);
    if (!titleRow) return null;

    const seasonsStmt = this.db.prepare('SELECT * FROM seasons WHERE title_id = ? ORDER BY season_number ASC');
    const seasonsRows = seasonsStmt.all(id);

    const episodesStmt = this.db.prepare(`
      SELECT e.*, m.id AS media_id, m.file_path, m.file_size, m.format, m.resolution, m.audio_track, m.download_date, m.verified,
             w.id AS watch_id, w.position_seconds, w.duration_seconds AS watch_duration, w.is_completed, w.last_watched_at
      FROM episodes e
      LEFT JOIN media_files m ON e.id = m.episode_id
      LEFT JOIN watch_progress w ON e.id = w.episode_id
      WHERE e.title_id = ?
      ORDER BY e.episode_number ASC
    `);
    const episodesRows = episodesStmt.all(id);

    const episodesBySeason = new Map<string, LibraryEpisode[]>();
    let totalEpisodes = 0;
    let downloadedEpisodes = 0;
    let continueWatchingEpisode: LibraryEpisode | undefined;
    let lastWatchedTime = 0;

    for (const r of episodesRows) {
      totalEpisodes++;

      const mediaFile: MediaFile | undefined = r.media_id
        ? {
            id: r.media_id,
            episodeId: r.id,
            filePath: r.file_path,
            fileSize: Number(r.file_size) || 0,
            format: r.format,
            resolution: r.resolution || undefined,
            audioTrack: r.audio_track || undefined,
            downloadDate: Number(r.download_date) || Date.now(),
            verified: Boolean(r.verified),
          }
        : undefined;

      const isDownloaded = Boolean(mediaFile && fs.existsSync(mediaFile.filePath));
      if (isDownloaded) {
        downloadedEpisodes++;
      }

      const watchProgress: WatchProgress | undefined = r.watch_id
        ? {
            id: r.watch_id,
            episodeId: r.id,
            titleId: r.title_id,
            positionSeconds: Number(r.position_seconds) || 0,
            durationSeconds: Number(r.watch_duration) || 0,
            isCompleted: Boolean(r.is_completed),
            lastWatchedAt: Number(r.last_watched_at) || 0,
          }
        : undefined;

      const libEpisode: LibraryEpisode = {
        id: r.id,
        seasonId: r.season_id,
        titleId: r.title_id,
        episodeNumber: Number(r.episode_number) || 0,
        name: r.name,
        durationSeconds: r.duration_seconds ? Number(r.duration_seconds) : undefined,
        thumbnailPath: r.thumbnail_path || undefined,
        mediaFile,
        watchProgress,
        isDownloaded,
      };

      if (watchProgress && watchProgress.lastWatchedAt > lastWatchedTime && !watchProgress.isCompleted && isDownloaded) {
        lastWatchedTime = watchProgress.lastWatchedAt;
        continueWatchingEpisode = libEpisode;
      }

      const list = episodesBySeason.get(r.season_id) || [];
      list.push(libEpisode);
      episodesBySeason.set(r.season_id, list);
    }

    const seasons: LibrarySeason[] = seasonsRows.map((sr: any) => ({
      id: sr.id,
      titleId: sr.title_id,
      seasonNumber: Number(sr.season_number) || 0,
      name: sr.name,
      episodeCount: Number(sr.episode_count) || 0,
      episodes: episodesBySeason.get(sr.id) || [],
    }));

    return {
      id: titleRow.id,
      name: titleRow.name,
      originalName: titleRow.original_name || undefined,
      description: titleRow.description || undefined,
      posterPath: titleRow.poster_path || undefined,
      backdropPath: titleRow.backdrop_path || undefined,
      authorizedSource: titleRow.authorized_source,
      createdAt: Number(titleRow.created_at) || Date.now(),
      seasons,
      totalEpisodes,
      downloadedEpisodes,
      continueWatchingEpisode,
      lastWatchedAt: lastWatchedTime > 0 ? lastWatchedTime : undefined,
    };
  }

  getAllTitles(filter?: LibraryFilter, search?: string): LibraryTitle[] {
    let query = 'SELECT id FROM titles';
    const params: any[] = [];

    if (search && search.trim()) {
      query += ' WHERE name LIKE ? OR original_name LIKE ?';
      const term = `%${search.trim()}%`;
      params.push(term, term);
    }

    query += ' ORDER BY created_at DESC';

    const stmt = this.db.prepare(query);
    const rows = stmt.all(...params);

    const titles: LibraryTitle[] = [];
    for (const r of rows) {
      const full = this.getTitle(r.id);
      if (!full) continue;

      if (filter === 'continue_watching') {
        if (!full.continueWatchingEpisode) continue;
      } else if (filter === 'completed') {
        if (full.totalEpisodes === 0 || full.downloadedEpisodes < full.totalEpisodes) continue;
      } else if (filter === 'recently_added') {
        // Only titles with at least 1 downloaded episode
        if (full.downloadedEpisodes === 0) continue;
      }

      titles.push(full);
    }

    if (filter === 'continue_watching') {
      titles.sort((a, b) => (b.lastWatchedAt || 0) - (a.lastWatchedAt || 0));
    }

    return titles;
  }

  getEpisode(id: string): LibraryEpisode | null {
    const stmt = this.db.prepare(`
      SELECT e.*, m.id AS media_id, m.file_path, m.file_size, m.format, m.resolution, m.audio_track, m.download_date, m.verified,
             w.id AS watch_id, w.position_seconds, w.duration_seconds AS watch_duration, w.is_completed, w.last_watched_at
      FROM episodes e
      LEFT JOIN media_files m ON e.id = m.episode_id
      LEFT JOIN watch_progress w ON e.id = w.episode_id
      WHERE e.id = ?
    `);
    const r = stmt.get(id);
    if (!r) return null;

    const mediaFile: MediaFile | undefined = r.media_id
      ? {
          id: r.media_id,
          episodeId: r.id,
          filePath: r.file_path,
          fileSize: Number(r.file_size) || 0,
          format: r.format,
          resolution: r.resolution || undefined,
          audioTrack: r.audio_track || undefined,
          downloadDate: Number(r.download_date) || Date.now(),
          verified: Boolean(r.verified),
        }
      : undefined;

    const isDownloaded = Boolean(mediaFile && fs.existsSync(mediaFile.filePath));

    const watchProgress: WatchProgress | undefined = r.watch_id
      ? {
          id: r.watch_id,
          episodeId: r.id,
          titleId: r.title_id,
          positionSeconds: Number(r.position_seconds) || 0,
          durationSeconds: Number(r.watch_duration) || 0,
          isCompleted: Boolean(r.is_completed),
          lastWatchedAt: Number(r.last_watched_at) || 0,
        }
      : undefined;

    return {
      id: r.id,
      seasonId: r.season_id,
      titleId: r.title_id,
      episodeNumber: Number(r.episode_number) || 0,
      name: r.name,
      durationSeconds: r.duration_seconds ? Number(r.duration_seconds) : undefined,
      thumbnailPath: r.thumbnail_path || undefined,
      mediaFile,
      watchProgress,
      isDownloaded,
    };
  }

  getNextEpisode(episodeId: string): LibraryEpisode | null {
    const current = this.getEpisode(episodeId);
    if (!current) return null;

    const stmt = this.db.prepare(`
      SELECT id FROM episodes
      WHERE title_id = ? AND (
        season_id = ? AND episode_number > ?
        OR season_id IN (
          SELECT id FROM seasons WHERE title_id = ? AND season_number > (
            SELECT season_number FROM seasons WHERE id = ?
          )
        )
      )
      ORDER BY season_id ASC, episode_number ASC
      LIMIT 1
    `);

    const row = stmt.get(current.titleId, current.seasonId, current.episodeNumber, current.titleId, current.seasonId);
    if (!row) return null;
    return this.getEpisode(row.id);
  }

  getPreviousEpisode(episodeId: string): LibraryEpisode | null {
    const current = this.getEpisode(episodeId);
    if (!current) return null;

    const stmt = this.db.prepare(`
      SELECT id FROM episodes
      WHERE title_id = ? AND (
        season_id = ? AND episode_number < ?
        OR season_id IN (
          SELECT id FROM seasons WHERE title_id = ? AND season_number < (
            SELECT season_number FROM seasons WHERE id = ?
          )
        )
      )
      ORDER BY season_id DESC, episode_number DESC
      LIMIT 1
    `);

    const row = stmt.get(current.titleId, current.seasonId, current.episodeNumber, current.titleId, current.seasonId);
    if (!row) return null;
    return this.getEpisode(row.id);
  }

  deleteTitle(id: string): void {
    this.db.exec('BEGIN TRANSACTION');
    try {
      this.db.prepare('DELETE FROM watch_progress WHERE title_id = ?').run(id);
      this.db.prepare('DELETE FROM media_files WHERE episode_id IN (SELECT id FROM episodes WHERE title_id = ?)').run(id);
      this.db.prepare('DELETE FROM episodes WHERE title_id = ?').run(id);
      this.db.prepare('DELETE FROM seasons WHERE title_id = ?').run(id);
      this.db.prepare('DELETE FROM titles WHERE id = ?').run(id);
      this.db.exec('COMMIT');
    } catch (err) {
      try {
        this.db.exec('ROLLBACK');
      } catch {}
      throw err;
    }
  }

  deleteMediaFile(id: string, deleteDiskFile: boolean = false): boolean {
    try {
      if (deleteDiskFile) {
        const stmtGet = this.db.prepare('SELECT file_path FROM media_files WHERE id = ?');
        const row = stmtGet.get(id);
        if (row && row.file_path && fs.existsSync(row.file_path)) {
          try {
            fs.unlinkSync(row.file_path);
          } catch (e) {
            console.warn('Failed to delete file from disk:', e);
          }
        }
      }
      const stmt = this.db.prepare('DELETE FROM media_files WHERE id = ?');
      const res = stmt.run(id);
      return res.changes > 0;
    } catch (err) {
      console.error('Failed to delete media file:', err);
      return false;
    }
  }
}
