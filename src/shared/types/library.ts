export interface Title {
  id: string;
  name: string;
  originalName?: string;
  description?: string;
  posterPath?: string;
  backdropPath?: string;
  authorizedSource: string;
  createdAt?: number;
}

export interface Season {
  id: string;
  titleId: string;
  seasonNumber: number;
  name: string;
  episodeCount?: number;
}

export interface Episode {
  id: string;
  seasonId: string;
  titleId: string;
  episodeNumber: number;
  name: string;
  durationSeconds?: number;
  thumbnailPath?: string;
}

export interface MediaFile {
  id: string;
  episodeId: string;
  filePath: string;
  fileSize: number;
  format: string; // e.g. "mp4", "mkv"
  resolution?: string; // e.g. "1080p", "720p"
  audioTrack?: string;
  downloadDate: number;
  verified: boolean;
}

export interface WatchProgress {
  id: string;
  episodeId: string;
  titleId: string;
  positionSeconds: number;
  durationSeconds: number;
  isCompleted: boolean;
  lastWatchedAt: number;
}

export interface LibraryEpisode extends Episode {
  mediaFile?: MediaFile;
  watchProgress?: WatchProgress;
  isDownloaded: boolean;
  isDownloading?: boolean;
}

export interface LibrarySeason extends Season {
  episodes: LibraryEpisode[];
}

export interface LibraryTitle extends Title {
  seasons: LibrarySeason[];
  totalEpisodes: number;
  downloadedEpisodes: number;
  continueWatchingEpisode?: LibraryEpisode;
  lastWatchedAt?: number;
}

export type LibraryFilter = 'all' | 'continue_watching' | 'recently_added' | 'completed';
