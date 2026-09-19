import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';
import { ElectronApi, AddDownloadsPayload, DownloadSeasonPayload } from '../shared/types/ipc';
import { DownloadItem, DownloadProgress, DownloadStatus } from '../shared/types/download';
import { AppSettings } from '../shared/types/settings';
import { LibraryFilter, LibraryTitle, LibraryEpisode, WatchProgress } from '../shared/types/library';
import { TitleMetadata, EpisodeMetadata, DownloadVariant, ProviderInfo } from '../shared/types/provider';
import { ExportJob, ExportRequestPayload, DriveInfo } from '../shared/types/export';
import { StorageOverview, MigrationResult } from '../shared/types/storage';
import {
  AiSubtitleConfig,
  AiSubtitleProgress,
  BatchSubtitleJob,
  LiveTranslationResult,
} from '../shared/types/ai';
import {
  HardwareInfo,
  ModelMetadata,
  BenchmarkResult,
} from '../shared/types/offlineEngine';

const api: ElectronApi = {
  // Downloads
  addDownloads: (payload: AddDownloadsPayload): Promise<DownloadItem[]> => {
    return ipcRenderer.invoke('downloads:add', payload);
  },
  downloadSeason: (payload: DownloadSeasonPayload): Promise<DownloadItem[]> => {
    return ipcRenderer.invoke('downloads:downloadSeason', payload);
  },
  pauseDownload: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('downloads:pause', id);
  },
  resumeDownload: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('downloads:resume', id);
  },
  cancelDownload: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('downloads:cancel', id);
  },
  retryDownload: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('downloads:retry', id);
  },
  removeDownload: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('downloads:remove', id);
  },
  getAllDownloads: (): Promise<DownloadItem[]> => {
    return ipcRenderer.invoke('downloads:getAll');
  },
  reorderDownload: (id: string, newIndex: number): Promise<boolean> => {
    return ipcRenderer.invoke('downloads:reorder', id, newIndex);
  },
  openFolder: (filePath: string): Promise<boolean> => {
    return ipcRenderer.invoke('downloads:openFolder', filePath);
  },
  selectDirectory: (): Promise<string | null> => {
    return ipcRenderer.invoke('downloads:selectDirectory');
  },
  importTxt: (): Promise<string[]> => {
    return ipcRenderer.invoke('downloads:importTxt');
  },

  // Library
  getLibraryTitles: (filter?: LibraryFilter, search?: string): Promise<LibraryTitle[]> => {
    return ipcRenderer.invoke('library:getTitles', filter, search);
  },
  getLibraryTitle: (id: string): Promise<LibraryTitle | null> => {
    return ipcRenderer.invoke('library:getTitle', id);
  },
  deleteLibraryTitle: (id: string, deleteFiles?: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('library:deleteTitle', id, deleteFiles);
  },
  deleteMediaFile: (mediaFileId: string, deleteDiskFile?: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('library:deleteMediaFile', mediaFileId, deleteDiskFile);
  },
  scanLibrary: (): Promise<number> => {
    return ipcRenderer.invoke('library:scan');
  },

  // Player & Watch Progress
  getWatchProgress: (episodeId: string): Promise<WatchProgress | null> => {
    return ipcRenderer.invoke('player:getProgress', episodeId);
  },
  saveWatchProgress: (episodeId: string, titleId: string, positionSeconds: number, durationSeconds: number): Promise<boolean> => {
    return ipcRenderer.invoke('player:saveProgress', episodeId, titleId, positionSeconds, durationSeconds);
  },
  markEpisodeWatched: (episodeId: string, titleId: string, watched: boolean): Promise<boolean> => {
    return ipcRenderer.invoke('player:markWatched', episodeId, titleId, watched);
  },
  getNextEpisode: (episodeId: string): Promise<LibraryEpisode | null> => {
    return ipcRenderer.invoke('player:getNextEpisode', episodeId);
  },
  getPreviousEpisode: (episodeId: string): Promise<LibraryEpisode | null> => {
    return ipcRenderer.invoke('player:getPreviousEpisode', episodeId);
  },
  findSubtitles: (mediaFilePath: string): Promise<Array<{ label: string; filePath: string }>> => {
    return ipcRenderer.invoke('player:findSubtitles', mediaFilePath);
  },
  selectSubtitleFile: (): Promise<{ label: string; filePath: string; content: string } | null> => {
    return ipcRenderer.invoke('player:selectSubtitleFile');
  },
  readSubtitleContent: (filePath: string): Promise<string | null> => {
    return ipcRenderer.invoke('player:readSubtitleContent', filePath);
  },

  // AI Subtitles & Live Translation
  generateAiSubtitles: (episodeId: string): Promise<{ success: boolean; srtPath?: string; error?: string }> => {
    return ipcRenderer.invoke('ai:generateEpisodeSubtitles', episodeId);
  },
  batchGenerateSeasonSubtitles: (titleId: string, seasonNumber: number): Promise<BatchSubtitleJob> => {
    return ipcRenderer.invoke('ai:batchGenerateSeason', titleId, seasonNumber);
  },
  getBatchSubtitleJobs: (): Promise<BatchSubtitleJob[]> => {
    return ipcRenderer.invoke('ai:getBatchJobs');
  },
  translateLiveAudioSlice: (audioBase64?: string): Promise<LiveTranslationResult> => {
    return ipcRenderer.invoke('ai:translateLiveAudioSlice', audioBase64);
  },
  getAiConfig: (): Promise<AiSubtitleConfig> => {
    return ipcRenderer.invoke('ai:getSubtitleConfig');
  },
  updateAiConfig: (config: Partial<AiSubtitleConfig>): Promise<AiSubtitleConfig> => {
    return ipcRenderer.invoke('ai:updateSubtitleConfig', config);
  },
  getHardwareInfo: (): Promise<HardwareInfo> => {
    return ipcRenderer.invoke('ai:getHardwareInfo');
  },
  getAllModels: (): Promise<ModelMetadata[]> => {
    return ipcRenderer.invoke('ai:getAllModels');
  },
  installModel: (modelId: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:installModel', modelId);
  },
  deleteModel: (modelId: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:deleteModel', modelId);
  },
  verifyModel: (modelId: string): Promise<{ verified: boolean; checksum?: string; error?: string }> => {
    return ipcRenderer.invoke('ai:verifyModel', modelId);
  },
  runBenchmark: (modelId?: string, device?: 'cuda' | 'cpu'): Promise<BenchmarkResult> => {
    return ipcRenderer.invoke('ai:runBenchmark', modelId, device);
  },
  pauseBatchJob: (jobId: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:pauseBatchJob', jobId);
  },
  resumeBatchJob: (jobId: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:resumeBatchJob', jobId);
  },
  cancelBatchJob: (jobId: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:cancelBatchJob', jobId);
  },

  // Live Read-Ahead Subtitles
  startLiveReadAhead: (videoPath: string, startPos?: number, speed?: number): Promise<void> => {
    return ipcRenderer.invoke('ai:startLiveReadAhead', videoPath, startPos, speed);
  },
  seekLiveReadAhead: (newPosition: number): Promise<void> => {
    return ipcRenderer.invoke('ai:seekLiveReadAhead', newPosition);
  },
  updateLivePlayhead: (position: number): Promise<void> => {
    return ipcRenderer.invoke('ai:updateLivePlayhead', position);
  },
  stopLiveReadAhead: (): Promise<void> => {
    return ipcRenderer.invoke('ai:stopLiveReadAhead');
  },
  getLiveActiveCue: (position: number): Promise<any | null> => {
    return ipcRenderer.invoke('ai:getLiveActiveCue', position);
  },
  exportLiveSubtitles: (videoPath?: string): Promise<string> => {
    return ipcRenderer.invoke('ai:exportLiveSubtitles', videoPath);
  },

  // Heterogeneous Scheduler & Metrics
  getSchedulerMetrics: (): Promise<any> => {
    return ipcRenderer.invoke('ai:getSchedulerMetrics');
  },
  setSchedulerPolicy: (policy: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:setSchedulerPolicy', policy);
  },

  // Title Glossary
  getGlossary: (titleId: string): Promise<any[]> => {
    return ipcRenderer.invoke('ai:getGlossary', titleId);
  },
  addGlossaryTerm: (titleId: string, sourceTerm: string, targetTerm: string, category?: string): Promise<any | null> => {
    return ipcRenderer.invoke('ai:addGlossaryTerm', titleId, sourceTerm, targetTerm, category);
  },
  deleteGlossaryTerm: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('ai:deleteGlossaryTerm', id);
  },

  // Provider
  getProviders: (): Promise<ProviderInfo[]> => {
    return ipcRenderer.invoke('provider:getProviders');
  },
  searchProvider: (query: string, providerId?: string): Promise<TitleMetadata[]> => {
    return ipcRenderer.invoke('provider:search', query, providerId);
  },
  getProviderAnime: (id: string, providerId?: string): Promise<{ title: TitleMetadata; episodes: EpisodeMetadata[] }> => {
    return ipcRenderer.invoke('provider:getAnime', id, providerId);
  },
  getProviderVariants: (episodeId: string, providerId?: string): Promise<DownloadVariant[]> => {
    return ipcRenderer.invoke('provider:getVariants', episodeId, providerId);
  },

  // Export (Mobile & Removable Disks)
  exportMedia: (payload: ExportRequestPayload): Promise<ExportJob> => {
    return ipcRenderer.invoke('export:start', payload);
  },
  cancelExport: (jobId: string): Promise<boolean> => {
    return ipcRenderer.invoke('export:cancel', jobId);
  },
  getExportJobs: (): Promise<ExportJob[]> => {
    return ipcRenderer.invoke('export:getJobs');
  },
  getAvailableDrives: (): Promise<DriveInfo[]> => {
    return ipcRenderer.invoke('export:getDrives');
  },
  selectExportFolder: (): Promise<string | null> => {
    return ipcRenderer.invoke('export:selectFolder');
  },
  openExportFolder: (folderPath: string): Promise<boolean> => {
    return ipcRenderer.invoke('export:openFolder', folderPath);
  },

  // Storage Management
  getStorageOverview: (): Promise<StorageOverview> => {
    return ipcRenderer.invoke('storage:getOverview');
  },
  deleteWatchedEpisodes: (titleId?: string): Promise<number> => {
    return ipcRenderer.invoke('storage:deleteWatched', titleId);
  },
  migrateLibraryLocation: (newPath: string, moveFiles: boolean): Promise<MigrationResult> => {
    return ipcRenderer.invoke('storage:migrate', newPath, moveFiles);
  },
  openLibraryFolder: (): Promise<boolean> => {
    return ipcRenderer.invoke('storage:openLibraryFolder');
  },
  selectNewLibraryLocation: (): Promise<string | null> => {
    return ipcRenderer.invoke('storage:selectNewLocation');
  },

  // Settings
  getSettings: (): Promise<AppSettings> => {
    return ipcRenderer.invoke('settings:get');
  },
  updateSettings: (settings: Partial<AppSettings>): Promise<AppSettings> => {
    return ipcRenderer.invoke('settings:update', settings);
  },

  // History
  getHistory: (): Promise<DownloadItem[]> => {
    return ipcRenderer.invoke('history:get');
  },
  clearHistory: (): Promise<boolean> => {
    return ipcRenderer.invoke('history:clear');
  },
  deleteHistoryItem: (id: string): Promise<boolean> => {
    return ipcRenderer.invoke('history:deleteItem', id);
  },

  // In-App Browser & Cloudflare Sniffer
  openSniffer: (targetUrl?: string): Promise<boolean> => {
    return ipcRenderer.invoke('sniffer:open', targetUrl);
  },
  getCapturedStreams: (): Promise<any[]> => {
    return ipcRenderer.invoke('sniffer:getCaptured');
  },
  clearCapturedStreams: (): Promise<boolean> => {
    return ipcRenderer.invoke('sniffer:clearCaptured');
  },
  queueCapturedStreams: (customTitle?: string): Promise<number> => {
    return ipcRenderer.invoke('sniffer:queueCaptured', customTitle);
  },
  batchExtractAnimepahe: (seriesUrl: string): Promise<any> => {
    return ipcRenderer.invoke('sniffer:batchExtractAnimepahe', seriesUrl);
  },

  // Subscriptions
  onProgress: (callback: (progress: DownloadProgress) => void) => {
    const listener = (_event: IpcRendererEvent, progress: DownloadProgress) => callback(progress);
    ipcRenderer.on('downloads:progress', listener);
    return () => {
      ipcRenderer.removeListener('downloads:progress', listener);
    };
  },

  onStatusChange: (callback: (data: { id: string; status: DownloadStatus; waiting?: { reason: string; retryAt: number }; error?: string }) => void) => {
    const listener = (_event: IpcRendererEvent, data: any) => callback(data);
    ipcRenderer.on('downloads:statusChange', listener);
    return () => {
      ipcRenderer.removeListener('downloads:statusChange', listener);
    };
  },

  onQueueUpdated: (callback: (items: DownloadItem[]) => void) => {
    const listener = (_event: IpcRendererEvent, items: DownloadItem[]) => callback(items);
    ipcRenderer.on('downloads:queueUpdated', listener);
    return () => {
      ipcRenderer.removeListener('downloads:queueUpdated', listener);
    };
  },

  onLibraryUpdated: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on('library:updated', listener);
    return () => {
      ipcRenderer.removeListener('library:updated', listener);
    };
  },

  onExportProgress: (callback: (job: ExportJob) => void) => {
    const listener = (_event: IpcRendererEvent, job: ExportJob) => callback(job);
    ipcRenderer.on('export:progress', listener);
    return () => {
      ipcRenderer.removeListener('export:progress', listener);
    };
  },

  onExportStatusChange: (callback: (job: ExportJob) => void) => {
    const listener = (_event: IpcRendererEvent, job: ExportJob) => callback(job);
    ipcRenderer.on('export:statusChange', listener);
    return () => {
      ipcRenderer.removeListener('export:statusChange', listener);
    };
  },
  onAiSubtitleProgress: (callback: (p: AiSubtitleProgress) => void) => {
    const listener = (_event: IpcRendererEvent, p: AiSubtitleProgress) => callback(p);
    ipcRenderer.on('ai:subtitle-progress', listener);
    return () => {
      ipcRenderer.removeListener('ai:subtitle-progress', listener);
    };
  },
  onBatchSubtitleUpdate: (callback: (job: BatchSubtitleJob) => void) => {
    const listener = (_event: IpcRendererEvent, job: BatchSubtitleJob) => callback(job);
    ipcRenderer.on('ai:batch-update', listener);
    return () => {
      ipcRenderer.removeListener('ai:batch-update', listener);
    };
  },
  onLiveChunkReady: (callback: (cues: any[]) => void) => {
    const listener = (_event: IpcRendererEvent, cues: any[]) => callback(cues);
    ipcRenderer.on('ai:live-chunk-ready', listener);
    return () => {
      ipcRenderer.removeListener('ai:live-chunk-ready', listener);
    };
  },
  onLiveBufferStatus: (callback: (status: any) => void) => {
    const listener = (_event: IpcRendererEvent, status: any) => callback(status);
    ipcRenderer.on('ai:live-buffer-status', listener);
    return () => {
      ipcRenderer.removeListener('ai:live-buffer-status', listener);
    };
  },
  onSnifferStreamsUpdated: (callback: (streams: any[]) => void) => {
    const listener = (_event: IpcRendererEvent, streams: any[]) => callback(streams);
    ipcRenderer.on('sniffer:streamsUpdated', listener);
    return () => {
      ipcRenderer.removeListener('sniffer:streamsUpdated', listener);
    };
  },
};

contextBridge.exposeInMainWorld('api', api);
