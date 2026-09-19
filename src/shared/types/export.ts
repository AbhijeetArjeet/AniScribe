export type ExportStatus = 'Queued' | 'Copying' | 'Completed' | 'Failed' | 'Cancelled';

export type CollisionResolution = 'rename' | 'replace' | 'skip' | 'keepBoth';

export interface ExportItem {
  id: string;
  sourceFilePath: string;
  destinationFilePath: string;
  titleName?: string;
  seasonNumber?: number;
  episodeNumber?: number;
  episodeName?: string;
  fileSizeBytes: number;
  copiedBytes: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // seconds
  status: ExportStatus;
  error?: string;
  createdAt: number;
  completedAt?: number;
}

export interface ExportJob {
  id: string;
  items: ExportItem[];
  destinationDir: string;
  createMobileFolders: boolean;
  collisionResolution: CollisionResolution;
  totalBytes: number;
  copiedBytes: number;
  overallPercentage: number;
  status: ExportStatus;
  currentFileIndex: number;
  includeSubtitles?: boolean;
  createdAt: number;
  completedAt?: number;
}

export interface ExportRequestPayload {
  mediaFileIds: string[]; // IDs from media_files
  destinationDir: string;
  createMobileFolders?: boolean; // BatchFetch Export/<Title>/Season <SS>/...
  collisionResolution?: CollisionResolution;
  isMove?: boolean; // Default false (safe copy)
  includeSubtitles?: boolean; // Copy matching .en.srt / .ja.srt alongside video files
}

export interface DriveInfo {
  mount: string; // e.g. "E:" or "E:\"
  label: string; // e.g. "USB Drive" or "SD Card"
  isRemovable: boolean;
  freeBytes?: number;
  totalBytes?: number;
}
