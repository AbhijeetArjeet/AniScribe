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

  ipcMain.handle('sniffer:setCookie', async (_event, cookieValue: string) => {
    return await snifferManager.setClearanceCookie(cookieValue);
  });

  ipcMain.handle('sniffer:openExternal', async (_event, url: string) => {
    const { shell } = require('electron');
    await shell.openExternal(url);
    return true;
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

  ipcMain.on('aniscribe:setCookie', async (_event, val: string) => {
    console.log('[MediaSniffer] In-page setCookie received');
    await snifferManager.setClearanceCookie(val);
  });
}
