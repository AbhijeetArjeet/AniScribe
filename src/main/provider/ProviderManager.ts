import { ProviderRegistry } from './ProviderRegistry';
import { TitleMetadata, EpisodeMetadata, SeasonMetadata, DownloadVariant, ProviderInfo } from '../../shared/types/provider';

export class ProviderManager {
  private registry: ProviderRegistry;

  constructor(registry: ProviderRegistry) {
    this.registry = registry;
  }

  getProviders(): ProviderInfo[] {
    return this.registry.getAll();
  }

  async search(query: string, providerId?: string): Promise<TitleMetadata[]> {
    try {
      const provider = this.registry.get(providerId);
      return await provider.searchAnime(query);
    } catch (err: any) {
      console.warn(`[ProviderManager] Search failed (${providerId || 'default'}):`, err.message);
      return [];
    }
  }

  async getAnime(
    id: string,
    providerId?: string
  ): Promise<{ title: TitleMetadata; episodes: EpisodeMetadata[]; seasons: SeasonMetadata[] }> {
    const provider = this.registry.get(providerId);
    try {
      const [title, episodes, seasons] = await Promise.all([
        provider.getAnime(id),
        provider.getEpisodes(id),
        provider.getSeasons(id),
      ]);
      return { title, episodes, seasons };
    } catch (err: any) {
      console.error(`[ProviderManager] getAnime failed for id "${id}":`, err.message);
      throw new Error(`Failed to load anime details: ${err.message}`);
    }
  }

  async getVariants(episodeId: string, providerId?: string): Promise<DownloadVariant[]> {
    const provider = this.registry.get(providerId);
    try {
      return await provider.getVariants(episodeId);
    } catch (err: any) {
      console.error(`[ProviderManager] getVariants failed for episode "${episodeId}":`, err.message);
      return [];
    }
  }
}
