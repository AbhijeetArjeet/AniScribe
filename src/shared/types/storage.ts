export interface TitleStorageBreakdown {
  id: string;
  titleName: string;
  totalBytes: number;
  episodeCount: number;
  downloadedCount: number;
  seasons: {
    seasonNumber: number;
    totalBytes: number;
    episodeCount: number;
  }[];
}

export interface LargestMediaFile {
  id: string;
  filePath: string;
  fileName: string;
  fileSizeBytes: number;
  titleName: string;
  episodeName: string;
  seasonNumber: number;
  episodeNumber: number;
  resolution?: string;
  downloadDate: number;
}

export interface StorageOverview {
  libraryPath: string;
  totalLibrarySizeBytes: number;
  availableDiskSpaceBytes?: number;
  totalDiskCapacityBytes?: number;
  totalTitles: number;
  totalSeasons: number;
  totalEpisodes: number;
  totalMediaFiles: number;
  titleBreakdowns: TitleStorageBreakdown[];
  largestFiles: LargestMediaFile[];
}

export interface MigrationProgress {
  totalFiles: number;
  processedFiles: number;
  currentFileName: string;
  percentage: number;
  status: 'migrating' | 'verifying' | 'completed' | 'failed';
  error?: string;
}

export interface MigrationResult {
  success: boolean;
  movedCount: number;
  error?: string;
}
