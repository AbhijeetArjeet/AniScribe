import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LibraryRepository } from './libraryRepository';
import { DownloadItem } from '../../shared/types/download';
import { AppSettings } from '../../shared/types/settings';
import { Title, Season, Episode, MediaFile } from '../../shared/types/library';

export class LibraryManager {
  private repository: LibraryRepository;
  private getSettings: () => AppSettings;
  private onLibraryChanged?: () => void;

  constructor(
    repository: LibraryRepository,
    getSettings: () => AppSettings,
    onLibraryChanged?: () => void
  ) {
    this.repository = repository;
    this.getSettings = getSettings;
    this.onLibraryChanged = onLibraryChanged;
  }

  getLibraryDirectory(): string {
    const settings = this.getSettings();
    const baseDir = settings.downloadDirectory || process.cwd();
    const libDir = path.join(baseDir, 'Library');
    if (!fs.existsSync(libDir)) {
      fs.mkdirSync(libDir, { recursive: true });
    }
    return libDir;
  }

  /**
   * Automatically organizes completed download into library structure:
   * Library/<Title>/Season <SS>/<Title> - S<SS>E<EE> [<Quality>].<ext>
   */
  async organizeCompletedDownload(item: DownloadItem): Promise<string | null> {
    const sourcePath = path.join(item.destination, item.filename);
    if (!fs.existsSync(sourcePath)) {
      console.warn(`[LibraryManager] Source file not found: ${sourcePath}`);
      return null;
    }

    const stat = fs.statSync(sourcePath);
    if (stat.size === 0) {
      console.warn(`[LibraryManager] Source file is empty: ${sourcePath}`);
      return null;
    }

    const titleName = (item.title || path.basename(item.filename, path.extname(item.filename))).trim();
    const ext = path.extname(item.filename).replace(/^\./, '') || 'mp4';

    // Parse season and episode numbers
    let seasonNumber = 1;
    let episodeNumber = 1;
    if (item.episode) {
      const match = item.episode.match(/(?:s(\d+))?.*?e(?:pisode)?[\s._-]?(\d+)/i) || item.episode.match(/^(\d+)$/);
      if (match) {
        if (match[1] && match[2]) {
          seasonNumber = parseInt(match[1], 10);
          episodeNumber = parseInt(match[2], 10);
        } else if (match[1]) {
          episodeNumber = parseInt(match[1], 10);
        }
      }
    }

    const seasonPad = String(seasonNumber).padStart(2, '0');
    const episodePad = String(episodeNumber).padStart(2, '0');
    const quality = item.quality || '1080p';

    const libRoot = this.getLibraryDirectory();
    const safeTitleFolder = titleName.replace(/[\\/:*?"<>|]/g, '_').trim();
    const safeSeasonFolder = `Season ${seasonPad}`;
    const targetDir = path.join(libRoot, safeTitleFolder, safeSeasonFolder);

    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const formattedFilename = `${safeTitleFolder} - S${seasonPad}E${episodePad} [${quality}].${ext}`;
    const targetPath = path.join(targetDir, formattedFilename);

    // Move file
    try {
      if (sourcePath !== targetPath) {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
        fs.renameSync(sourcePath, targetPath);
      }
    } catch (err: any) {
      console.error('[LibraryManager] Failed to move file to library:', err.message);
      return null;
    }

    // Upsert into Database
    const titleId = `title-${crypto.createHash('md5').update(titleName.toLowerCase()).digest('hex').slice(0, 12)}`;
    const seasonId = `${titleId}-s${seasonNumber}`;
    const episodeId = `${seasonId}-e${episodeNumber}`;

    const titleEntity: Title = {
      id: titleId,
      name: titleName,
      authorizedSource: item.hostname || 'Authorized Provider',
      createdAt: item.createdAt || Date.now(),
    };
    this.repository.upsertTitle(titleEntity);

    const seasonEntity: Season = {
      id: seasonId,
      titleId,
      seasonNumber,
      name: `Season ${seasonNumber}`,
      episodeCount: Math.max(1, episodeNumber),
    };
    this.repository.upsertSeason(seasonEntity);

    const episodeEntity: Episode = {
      id: episodeId,
      seasonId,
      titleId,
      episodeNumber,
      name: `Episode ${episodeNumber}`,
    };
    this.repository.upsertEpisode(episodeEntity);

    const mediaFileEntity: MediaFile = {
      id: `media-${crypto.randomUUID()}`,
      episodeId,
      filePath: targetPath,
      fileSize: stat.size,
      format: ext,
      resolution: quality,
      downloadDate: Date.now(),
      verified: true,
    };
    this.repository.upsertMediaFile(mediaFileEntity);

    if (this.onLibraryChanged) {
      this.onLibraryChanged();
    }

    console.log(`[LibraryManager] Successfully organized "${formattedFilename}" into library.`);
    return targetPath;
  }

  /**
   * Scans the Library folder on disk and imports existing media files into SQLite
   */
  scanLibrary(): number {
    const libRoot = this.getLibraryDirectory();
    if (!fs.existsSync(libRoot)) return 0;

    let importedCount = 0;
    const titles = fs.readdirSync(libRoot, { withFileTypes: true });

    for (const titleDir of titles) {
      if (!titleDir.isDirectory()) continue;
      const titlePath = path.join(libRoot, titleDir.name);
      const titleName = titleDir.name;
      const titleId = `title-${crypto.createHash('md5').update(titleName.toLowerCase()).digest('hex').slice(0, 12)}`;

      this.repository.upsertTitle({
        id: titleId,
        name: titleName,
        authorizedSource: 'Local Library',
        createdAt: Date.now(),
      });

      const seasonDirs = fs.readdirSync(titlePath, { withFileTypes: true });
      for (const seasonDir of seasonDirs) {
        if (!seasonDir.isDirectory()) continue;
        const seasonPath = path.join(titlePath, seasonDir.name);
        const matchSeason = seasonDir.name.match(/season\s*(\d+)/i);
        const seasonNumber = matchSeason ? parseInt(matchSeason[1], 10) : 1;
        const seasonId = `${titleId}-s${seasonNumber}`;

        this.repository.upsertSeason({
          id: seasonId,
          titleId,
          seasonNumber,
          name: seasonDir.name,
          episodeCount: 0,
        });

        const files = fs.readdirSync(seasonPath, { withFileTypes: true });
        for (const file of files) {
          if (!file.isFile()) continue;
          const ext = path.extname(file.name).toLowerCase();
          if (!['.mp4', '.mkv', '.avi', '.webm'].includes(ext)) continue;

          const filePath = path.join(seasonPath, file.name);
          const stat = fs.statSync(filePath);

          // Parse episode number
          const matchEp = file.name.match(/[es](\d+)[._\s-]*e(?:p)?(\d+)/i) || file.name.match(/e(?:pisode)?[\s._-]?(\d+)/i);
          const episodeNumber = matchEp ? parseInt(matchEp[2] || matchEp[1], 10) : 1;
          const episodeId = `${seasonId}-e${episodeNumber}`;

          this.repository.upsertEpisode({
            id: episodeId,
            seasonId,
            titleId,
            episodeNumber,
            name: `Episode ${episodeNumber}`,
          });

          this.repository.upsertMediaFile({
            id: `media-${crypto.createHash('md5').update(filePath).digest('hex').slice(0, 12)}`,
            episodeId,
            filePath,
            fileSize: stat.size,
            format: ext.replace(/^\./, ''),
            downloadDate: stat.mtimeMs || Date.now(),
            verified: true,
          });

          importedCount++;
        }
      }
    }

    if (this.onLibraryChanged) {
      this.onLibraryChanged();
    }

    return importedCount;
  }

  scanLibraryFolder(): number {
    return this.scanLibrary();
  }
}
