import {
  ProviderAdapter,
  TitleMetadata,
  SeasonMetadata,
  EpisodeMetadata,
  DownloadVariant,
} from '../../shared/types/provider';

/**
 * AuthorizedProviderAdapter
 * Consumes authorized JSON APIs that provide direct media download URLs.
 * Strictly consumes authorized API responses and returns direct authorized HTTP/HTTPS URLs.
 * Does NOT scrape, bypass auth/anti-bot, solve CAPTCHA, or circumvent DRM.
 */
export class AuthorizedProviderAdapter implements ProviderAdapter {
  readonly id: string;
  readonly name: string;
  private apiBaseUrl: string;
  private apiKey?: string;

  constructor(apiBaseUrl: string, apiKey?: string, id = 'authorized-api', name = 'Authorized Provider API') {
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, '');
    this.apiKey = apiKey;
    this.id = id;
    this.name = name;
  }

  private async fetchJson<T>(endpoint: string): Promise<T> {
    const url = `${this.apiBaseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      Accept: 'application/json',
      'User-Agent': 'BatchFetch/1.0',
    };
    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, { headers });
    if (!response.ok) {
      throw new Error(`Provider API error (${response.status}): ${response.statusText}`);
    }
    return (await response.json()) as T;
  }

  async searchAnime(query: string): Promise<TitleMetadata[]> {
    return await this.fetchJson<TitleMetadata[]>(`/search?q=${encodeURIComponent(query)}`);
  }

  async getAnime(id: string): Promise<TitleMetadata> {
    return await this.fetchJson<TitleMetadata>(`/titles/${encodeURIComponent(id)}`);
  }

  // Backwards compatibility alias
  async getTitle(id: string): Promise<TitleMetadata> {
    return await this.getAnime(id);
  }

  async getSeasons(titleId: string): Promise<SeasonMetadata[]> {
    try {
      return await this.fetchJson<SeasonMetadata[]>(`/titles/${encodeURIComponent(titleId)}/seasons`);
    } catch {
      // Fallback to single season if seasons endpoint not implemented on backend
      const title = await this.getAnime(titleId);
      return [
        {
          id: `${title.id}-s1`,
          titleId: title.id,
          seasonNumber: 1,
          name: 'Season 1',
          episodeCount: title.totalEpisodes || 1,
        },
      ];
    }
  }

  async getEpisodes(id: string, _seasonNumber?: number): Promise<EpisodeMetadata[]> {
    return await this.fetchJson<EpisodeMetadata[]>(`/titles/${encodeURIComponent(id)}/episodes`);
  }

  async getVariants(episodeId: string): Promise<DownloadVariant[]> {
    return await this.fetchJson<DownloadVariant[]>(`/episodes/${encodeURIComponent(episodeId)}/variants`);
  }
}
