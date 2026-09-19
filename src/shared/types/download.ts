export type DownloadStatus =
  | 'Queued'
  | 'Downloading'
  | 'Paused'
  | 'Waiting'
  | 'Completed'
  | 'Failed'
  | 'Cancelled';

export interface DownloadProgress {
  id: string;
  url: string;
  filename: string;
  hostname: string;
  destination: string;
  totalSize: number;
  downloadedBytes: number;
  percentage: number;
  speed: number; // bytes per second
  eta: number; // estimated seconds remaining
  status: DownloadStatus;
  error?: string;
  retryCount: number;
  maxRetries: number;
  retryAt?: number; // timestamp in ms when next retry will occur
  waitingReason?: string;
  rangeSupported: boolean;
  queueOrder: number;
  createdAt: number;
  completedAt?: number;
}

export interface DownloadItem extends DownloadProgress {
  title?: string;
  episode?: string;
  quality?: string;
}

export interface WaitingState {
  status: 'Waiting';
  reason: string;
  retryAt: number;
}

export interface DownloadStats {
  activeCount: number;
  queuedCount: number;
  completedCount: number;
  failedCount: number;
  totalSpeed: number;
}
