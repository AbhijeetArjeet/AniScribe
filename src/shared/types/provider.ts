export interface TitleMetadata {
  id: string;
  title: string;
  originalTitle?: string;
  description?: string;
  thumbnailUrl?: string;
  posterUrl?: string;
  backdropUrl?: string;
  totalEpisodes?: number;
  authorizedSource: string;
}

export interface SeasonMetadata {
  id: string;
  titleId: string;
  seasonNumber: number;
  name: string;
  episodeCount?: number;
}

export interface EpisodeMetadata {
  id: string;
  titleId: string;
  seasonNumber: number;
  episodeNumber: number;
  name: string;
  durationSeconds?: number;
  thumbnailUrl?: string;
  airDate?: string;
}

export type Episode = EpisodeMetadata;

export interface DownloadVariant {
  id: string;
  episodeId: string;
  quality: string; // e.g. "1080p", "720p", "480p"
  audioTrack: string; // e.g. "Original", "English"
  subtitles: string[]; // e.g. ["None", "English"]
  directUrl: string; // Direct authorized HTTP/HTTPS download URL
  fileSizeBytes?: number;
  format?: string; // e.g. "mp4", "mkv"
}

export interface ProviderInfo {
  id: string;
  name: string;
  description?: string;
  isMock?: boolean;
}

/**
 * ProviderAdapter interface for authorized API integrations.
 * Strictly consumes authorized API responses and returns direct authorized HTTP/HTTPS URLs.
 * Does NOT scrape, bypass auth/anti-bot, solve CAPTCHA, or circumvent DRM.
 */
export interface ProviderAdapter {
  readonly id: string;
  readonly name: string;
  searchAnime(query: string): Promise<TitleMetadata[]>;
  getAnime(id: string): Promise<TitleMetadata>;
  getSeasons(titleId: string): Promise<SeasonMetadata[]>;
  getEpisodes(titleId: string, seasonNumber?: number): Promise<EpisodeMetadata[]>;
  getVariants(episodeId: string): Promise<DownloadVariant[]>;
}
