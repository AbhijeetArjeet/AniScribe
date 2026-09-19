import { ipcMain, BrowserWindow } from 'electron';
import { SubtitleGenerator } from '../ai/subtitleGenerator';
import { AiSubtitleConfig } from '../../shared/types/ai';

export function registerAiHandlers(subtitleGenerator: SubtitleGenerator): void {
  ipcMain.handle('ai:getSubtitleConfig', () => {
    return subtitleGenerator.getConfig();
  });

  ipcMain.handle('ai:updateSubtitleConfig', (_event, partial: unknown) => {
    if (!partial || typeof partial !== 'object') {
      return subtitleGenerator.getConfig();
    }
    return subtitleGenerator.updateConfig(partial as Partial<AiSubtitleConfig>);
  });

  ipcMain.handle('ai:generateEpisodeSubtitles', async (_event, episodeId: unknown) => {
    if (typeof episodeId !== 'string' || !episodeId.trim()) {
      return { success: false, error: 'Invalid episode ID' };
    }
    return subtitleGenerator.generateSubtitlesForEpisode(episodeId.trim());
  });

  ipcMain.handle('ai:batchGenerateSeason', async (_event, titleId: unknown, seasonNumber: unknown) => {
    if (typeof titleId !== 'string' || typeof seasonNumber !== 'number') {
      throw new Error('Invalid titleId or seasonNumber');
    }
    return subtitleGenerator.queueBatchSeason(titleId.trim(), seasonNumber);
  });

  ipcMain.handle('ai:getBatchJobs', () => {
    return subtitleGenerator.getAllBatchJobs();
  });

  ipcMain.handle('ai:translateLiveAudioSlice', async (_event, audioBase64?: unknown) => {
    const validBase64 = typeof audioBase64 === 'string' ? audioBase64 : undefined;
    return subtitleGenerator.translateLiveAudioSlice(validBase64);
  });

  ipcMain.handle('ai:getHardwareInfo', async () => {
    return subtitleGenerator.getHardwareInfo();
  });

  ipcMain.handle('ai:getAllModels', () => {
    return subtitleGenerator.getAllModels();
  });

  ipcMain.handle('ai:installModel', async (_event, modelId: unknown) => {
    if (typeof modelId !== 'string' || !modelId.trim()) return false;
    return subtitleGenerator.modelRegistry.installMockModel(modelId.trim());
  });

  ipcMain.handle('ai:deleteModel', (_event, modelId: unknown) => {
    if (typeof modelId !== 'string' || !modelId.trim()) return false;
    return subtitleGenerator.modelRegistry.deleteModel(modelId.trim());
  });

  ipcMain.handle('ai:verifyModel', (_event, modelId: unknown) => {
    if (typeof modelId !== 'string' || !modelId.trim()) return { verified: false, error: 'Invalid model ID' };
    return subtitleGenerator.modelRegistry.verifyModel(modelId.trim());
  });

  ipcMain.handle('ai:runBenchmark', async (_event, modelId?: unknown, device?: unknown) => {
    const validModel = typeof modelId === 'string' ? modelId : undefined;
    const validDevice = device === 'cuda' || device === 'cpu' ? device : undefined;
    return subtitleGenerator.runBenchmark(validModel, validDevice);
  });

  ipcMain.handle('ai:pauseBatchJob', (_event, jobId: unknown) => {
    if (typeof jobId !== 'string' || !jobId.trim()) return false;
    return subtitleGenerator.pauseBatchJob(jobId.trim());
  });

  ipcMain.handle('ai:resumeBatchJob', (_event, jobId: unknown) => {
    if (typeof jobId !== 'string' || !jobId.trim()) return false;
    return subtitleGenerator.resumeBatchJob(jobId.trim());
  });

  ipcMain.handle('ai:cancelBatchJob', (_event, jobId: unknown) => {
    if (typeof jobId !== 'string' || !jobId.trim()) return false;
    return subtitleGenerator.cancelBatchJob(jobId.trim());
  });

  // --- Live Read-Ahead Handlers ---
  ipcMain.handle('ai:startLiveReadAhead', async (_event, videoPath: unknown, startPos: unknown, speed: unknown) => {
    if (typeof videoPath !== 'string') return;
    const pos = typeof startPos === 'number' ? startPos : 0;
    const spd = typeof speed === 'number' ? speed : 1.0;
    return subtitleGenerator.liveReadAheadManager.start(videoPath, pos, spd);
  });

  ipcMain.handle('ai:seekLiveReadAhead', (_event, newPosition: unknown) => {
    if (typeof newPosition !== 'number') return;
    subtitleGenerator.liveReadAheadManager.seek(newPosition);
  });

  ipcMain.handle('ai:updateLivePlayhead', (_event, position: unknown) => {
    if (typeof position !== 'number') return;
    subtitleGenerator.liveReadAheadManager.updatePlayhead(position);
  });

  ipcMain.handle('ai:stopLiveReadAhead', () => {
    subtitleGenerator.liveReadAheadManager.stop();
  });

  ipcMain.handle('ai:getLiveActiveCue', (_event, position: unknown) => {
    if (typeof position !== 'number') return null;
    return subtitleGenerator.liveReadAheadManager.getActiveCue(position);
  });

  ipcMain.handle('ai:exportLiveSubtitles', (_event, videoPath?: unknown) => {
    const vPath = typeof videoPath === 'string' ? videoPath : undefined;
    return subtitleGenerator.liveReadAheadManager.exportToSrt(vPath);
  });

  // --- Heterogeneous Scheduler Handlers ---
  ipcMain.handle('ai:getSchedulerMetrics', async () => {
    return subtitleGenerator.scheduler.getMetrics();
  });

  ipcMain.handle('ai:setSchedulerPolicy', (_event, policy: unknown) => {
    if (typeof policy === 'string') {
      subtitleGenerator.scheduler.setPolicy(policy as any);
      return true;
    }
    return false;
  });

  // --- Title Glossary Handlers ---
  ipcMain.handle('ai:getGlossary', (_event, titleId: unknown) => {
    if (typeof titleId !== 'string') return [];
    return subtitleGenerator.glossaryManager.getTerms(titleId);
  });

  ipcMain.handle('ai:addGlossaryTerm', (_event, titleId: unknown, sourceTerm: unknown, targetTerm: unknown, category: unknown) => {
    if (typeof titleId !== 'string' || typeof sourceTerm !== 'string' || typeof targetTerm !== 'string') return null;
    return subtitleGenerator.glossaryManager.addTerm(titleId, sourceTerm, targetTerm, (category as any) || 'term');
  });

  ipcMain.handle('ai:deleteGlossaryTerm', (_event, id: unknown) => {
    if (typeof id !== 'string') return false;
    return subtitleGenerator.glossaryManager.deleteTerm(id);
  });

  // Forward events from SubtitleGenerator to renderer
  subtitleGenerator.on('progress', (progress) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ai:subtitle-progress', progress);
      }
    }
  });

  subtitleGenerator.on('batch:update', (job) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ai:batch-update', job);
      }
    }
  });

  subtitleGenerator.on('live:chunk-ready', (cues) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ai:live-chunk-ready', cues);
      }
    }
  });

  subtitleGenerator.on('live:buffer-status', (status) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) {
        win.webContents.send('ai:live-buffer-status', status);
      }
    }
  });
}
