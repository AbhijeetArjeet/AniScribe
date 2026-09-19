import { ipcMain } from 'electron';
import { MediaSnifferManager } from '../sniffer/mediaSnifferManager';

export function registerSnifferHandlers(snifferManager: MediaSnifferManager): void {
  ipcMain.handle('sniffer:open', async (_event, targetUrl?: string) => {
    snifferManager.openBrowser(targetUrl);
    return true;
  });

  ipcMain.handle('sniffer:getCaptured', async () => {
    return snifferManager.getCapturedStreams();
  });

  ipcMain.handle('sniffer:clearCaptured', async () => {
    snifferManager.clearCapturedStreams();
    return true;
  });

  ipcMain.handle('sniffer:queueCaptured', async (_event, customTitle?: string) => {
    return await snifferManager.queueAllCaptured(customTitle);
  });

  ipcMain.handle('sniffer:batchExtractAnimepahe', async (_event, seriesUrl: string) => {
    return await snifferManager.batchExtractAnimepaheSeries(seriesUrl);
  });

  // Handle in-page messages from injected floating toolbar
  ipcMain.on('aniscribe:batchExtractFromPage', async (_event, pageUrl: string) => {
    console.log('[MediaSniffer] In-page batch extract triggered for:', pageUrl);
    await snifferManager.batchExtractAnimepaheSeries(pageUrl);
  });

  ipcMain.on('aniscribe:queueAllCaptured', async () => {
    console.log('[MediaSniffer] In-page queue all triggered');
    await snifferManager.queueAllCaptured();
  });
}
