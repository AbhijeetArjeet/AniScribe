import { DownloadItem, DownloadProgress, DownloadStatus } from './download';
import { AppSettings, TemplateContext } from './settings';
import { LibraryFilter, LibraryTitle, LibraryEpisode, WatchProgress } from './library';
import { TitleMetadata, EpisodeMetadata, DownloadVariant, ProviderInfo } from './provider';
import { ExportJob, ExportRequestPayload, DriveInfo } from './export';
import { StorageOverview, MigrationResult } from './storage';
import {
  AiSubtitleConfig,
  AiSubtitleProgress,
  BatchSubtitleJob,
  LiveTranslationResult,
} from './ai';
import {
  HardwareInfo,
  ModelMetadata,
  BenchmarkResult,
} from './offlineEngine';

export interface AddDownloadsPayload {
  urls: string[];
  templateContext?: TemplateContext;
}

export interface DownloadSeasonPayload {
  title: TitleMetadata;
  seasonNumber: number;
  episodes: EpisodeMetadata[];
  quality: string;
  audioTrack: string;
  subtitles: string;
  variants: Record<string, DownloadVariant>; // episodeId -> variant
}

export interface ElectronApi {
  // Downloads
  addDownloads: (payload: AddDownloadsPayload) => Promise<DownloadItem[]>;
  downloadSeason: (payload: DownloadSeasonPayload) => Promise<DownloadItem[]>;
  pauseDownload: (id: string) => Promise<boolean>;
  resumeDownload: (id: string) => Promise<boolean>;
  cancelDownload: (id: string) => Promise<boolean>;
  retryDownload: (id: string) => Promise<boolean>;
  removeDownload: (id: string) => Promise<boolean>;
  getAllDownloads: () => Promise<DownloadItem[]>;
  reorderDownload: (id: string, newIndex: number) => Promise<boolean>;
  openFolder: (filePath: string) => Promise<boolean>;
  selectDirectory: () => Promise<string | null>;
  importTxt: () => Promise<string[]>;

  // Library
  getLibraryTitles: (filter?: LibraryFilter, search?: string) => Promise<LibraryTitle[]>;
  getLibraryTitle: (id: string) => Promise<LibraryTitle | null>;
  deleteLibraryTitle: (id: string, deleteFiles?: boolean) => Promise<boolean>;
  deleteMediaFile: (mediaFileId: string, deleteDiskFile?: boolean) => Promise<boolean>;
  scanLibrary: () => Promise<number>;

  // Player & Watch Progress
  getWatchProgress: (episodeId: string) => Promise<WatchProgress | null>;
  saveWatchProgress: (episodeId: string, titleId: string, positionSeconds: number, durationSeconds: number) => Promise<boolean>;
  markEpisodeWatched: (episodeId: string, titleId: string, watched: boolean) => Promise<boolean>;
  getNextEpisode: (episodeId: string) => Promise<LibraryEpisode | null>;
  getPreviousEpisode: (episodeId: string) => Promise<LibraryEpisode | null>;
  findSubtitles: (mediaFilePath: string) => Promise<Array<{ label: string; filePath: string }>>;
  selectSubtitleFile: () => Promise<{ label: string; filePath: string; content: string } | null>;
  readSubtitleContent: (filePath: string) => Promise<string | null>;

  // AI Subtitles & Live Translation
  generateAiSubtitles: (episodeId: string) => Promise<{ success: boolean; srtPath?: string; error?: string }>;
  batchGenerateSeasonSubtitles: (titleId: string, seasonNumber: number) => Promise<BatchSubtitleJob>;
  getBatchSubtitleJobs: () => Promise<BatchSubtitleJob[]>;
  translateLiveAudioSlice: (audioBase64?: string) => Promise<LiveTranslationResult>;
  getAiConfig: () => Promise<AiSubtitleConfig>;
  updateAiConfig: (config: Partial<AiSubtitleConfig>) => Promise<AiSubtitleConfig>;
  getHardwareInfo: () => Promise<HardwareInfo>;
  getAllModels: () => Promise<ModelMetadata[]>;
  installModel: (modelId: string) => Promise<boolean>;
  deleteModel: (modelId: string) => Promise<boolean>;
  verifyModel: (modelId: string) => Promise<{ verified: boolean; checksum?: string; error?: string }>;
  runBenchmark: (modelId?: string, device?: 'cuda' | 'cpu') => Promise<BenchmarkResult>;
  pauseBatchJob: (jobId: string) => Promise<boolean>;
  resumeBatchJob: (jobId: string) => Promise<boolean>;
  cancelBatchJob: (jobId: string) => Promise<boolean>;

  // Live Read-Ahead Subtitles
  startLiveReadAhead: (videoPath: string, startPos?: number, speed?: number) => Promise<void>;
  seekLiveReadAhead: (newPosition: number) => Promise<void>;
  updateLivePlayhead: (position: number) => Promise<void>;
  stopLiveReadAhead: () => Promise<void>;
  getLiveActiveCue: (position: number) => Promise<any | null>;
  exportLiveSubtitles: (videoPath?: string) => Promise<string>;

  // Heterogeneous Scheduler & Metrics
  getSchedulerMetrics: () => Promise<any>;
  setSchedulerPolicy: (policy: string) => Promise<boolean>;

  // Title Glossary
  getGlossary: (titleId: string) => Promise<any[]>;
  addGlossaryTerm: (titleId: string, sourceTerm: string, targetTerm: string, category?: string) => Promise<any | null>;
  deleteGlossaryTerm: (id: string) => Promise<boolean>;

  // Provider (Authorized metadata & direct URLs)
  getProviders: () => Promise<ProviderInfo[]>;
  searchProvider: (query: string, providerId?: string) => Promise<TitleMetadata[]>;
  getProviderAnime: (id: string, providerId?: string) => Promise<{ title: TitleMetadata; episodes: EpisodeMetadata[] }>;
  getProviderVariants: (episodeId: string, providerId?: string) => Promise<DownloadVariant[]>;

  // Export (Mobile & Removable Disks)
  exportMedia: (payload: ExportRequestPayload) => Promise<ExportJob>;
  cancelExport: (jobId: string) => Promise<boolean>;
  getExportJobs: () => Promise<ExportJob[]>;
  getAvailableDrives: () => Promise<DriveInfo[]>;
  selectExportFolder: () => Promise<string | null>;
  openExportFolder: (folderPath: string) => Promise<boolean>;

  // Storage Management
  getStorageOverview: () => Promise<StorageOverview>;
  deleteWatchedEpisodes: (titleId?: string) => Promise<number>;
  migrateLibraryLocation: (newPath: string, moveFiles: boolean) => Promise<MigrationResult>;
  openLibraryFolder: () => Promise<boolean>;
  selectNewLibraryLocation: () => Promise<string | null>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  updateSettings: (settings: Partial<AppSettings>) => Promise<AppSettings>;

  // History
  getHistory: () => Promise<DownloadItem[]>;
  clearHistory: () => Promise<boolean>;
  deleteHistoryItem: (id: string) => Promise<boolean>;

  // In-App Browser & Cloudflare Sniffer
  openSniffer: (targetUrl?: string) => Promise<boolean>;
  getCapturedStreams: () => Promise<Array<{ id: string; url: string; title: string; quality?: string; sourceUrl: string; detectedAt: number }>>;
  clearCapturedStreams: () => Promise<boolean>;
  queueCapturedStreams: (customTitle?: string) => Promise<number>;
  batchExtractAnimepahe: (seriesUrl: string) => Promise<{
    animeTitle: string;
    queuedCount: number;
    episodes: Array<{ episodeNumber: number; url: string; title: string }>;
  }>;

  // Subscriptions
  onProgress: (callback: (progress: DownloadProgress) => void) => () => void;
  onStatusChange: (callback: (data: { id: string; status: DownloadStatus; waiting?: { reason: string; retryAt: number }; error?: string }) => void) => () => void;
  onQueueUpdated: (callback: (items: DownloadItem[]) => void) => () => void;
  onLibraryUpdated: (callback: () => void) => () => void;
  onExportProgress: (callback: (job: ExportJob) => void) => () => void;
  onExportStatusChange: (callback: (job: ExportJob) => void) => () => void;
  onAiSubtitleProgress: (callback: (p: AiSubtitleProgress) => void) => () => void;
  onBatchSubtitleUpdate: (callback: (job: BatchSubtitleJob) => void) => () => void;
  onLiveChunkReady: (callback: (cues: any[]) => void) => () => void;
  onLiveBufferStatus: (callback: (status: any) => void) => () => void;
  onSnifferStreamsUpdated: (callback: (streams: any[]) => void) => () => void;
}

declare global {
  interface Window {
    api: ElectronApi;
  }
}
