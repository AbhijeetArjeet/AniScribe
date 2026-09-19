import { ipcMain } from 'electron';
import { ProviderManager } from '../provider/ProviderManager';

export function registerProviderHandlers(providerManager: ProviderManager): void {
  ipcMain.handle('provider:getProviders', () => {
    return providerManager.getProviders();
  });

  ipcMain.handle('provider:search', async (_event, query: unknown, providerId?: unknown) => {
    if (typeof query !== 'string' || !query.trim()) return [];
    const pId = typeof providerId === 'string' && providerId.trim() ? providerId.trim() : undefined;
    return await providerManager.search(query.trim(), pId);
  });

  ipcMain.handle('provider:getAnime', async (_event, id: unknown, providerId?: unknown) => {
    if (typeof id !== 'string' || !id.trim()) throw new Error('Invalid anime ID');
    const pId = typeof providerId === 'string' && providerId.trim() ? providerId.trim() : undefined;
    return await providerManager.getAnime(id.trim(), pId);
  });

  ipcMain.handle('provider:getVariants', async (_event, episodeId: unknown, providerId?: unknown) => {
    if (typeof episodeId !== 'string' || !episodeId.trim()) return [];
    const pId = typeof providerId === 'string' && providerId.trim() ? providerId.trim() : undefined;
    return await providerManager.getVariants(episodeId.trim(), pId);
  });
}
