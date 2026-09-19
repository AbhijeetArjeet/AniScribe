import { ProviderAdapter, TitleMetadata, SeasonMetadata, EpisodeMetadata, DownloadVariant } from '../../shared/types/provider';

/**
 * MockProvider
 * Realistic mock provider for local development, offline usage, and automated testing.
 * Uses public authorized test media URLs without scraping or anti-bot circumvention.
 */
export class MockProvider implements ProviderAdapter {
  readonly id = 'mock-provider';
  readonly name = 'Authorized Public Anime Archive (Mock)';

  private titles: TitleMetadata[] = [
    {
      id: 'mock-cyberpunk',
      title: 'Cyberpunk: Edgerunners',
      originalTitle: 'サイバーパンク エッジランナーズ',
      description: 'In a dystopia riddled with corruption and cybernetic implants, a street kid tries to survive.',
      posterUrl: 'https://images.unsplash.com/photo-1578632767115-351597cf2477?w=400',
      totalEpisodes: 10,
      authorizedSource: 'Authorized Public Anime Archive',
    },
    {
      id: 'mock-frieren',
      title: "Frieren: Beyond Journey's End",
      originalTitle: '葬送のフリーレン',
      description: 'An elf mage and her companions defeat the Demon King, and she embarks on a journey to understand mortals.',
      posterUrl: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?w=400',
      totalEpisodes: 28,
      authorizedSource: 'Authorized Public Anime Archive',
    },
    {
      id: 'mock-bocchi',
      title: 'Bocchi the Rock!',
      originalTitle: 'ぼっち・ざ・ろっく！',
      description: 'An introverted high school girl who plays guitar joins a pop rock band.',
      posterUrl: 'https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400',
      totalEpisodes: 12,
      authorizedSource: 'Authorized Public Anime Archive',
    },
  ];

  async searchAnime(query: string): Promise<TitleMetadata[]> {
    const q = query.toLowerCase().trim();
    if (!q) return [...this.titles];
    return this.titles.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        (t.originalTitle && t.originalTitle.toLowerCase().includes(q)) ||
        (t.description && t.description.toLowerCase().includes(q))
    );
  }

  async getAnime(id: string): Promise<TitleMetadata> {
    const title = this.titles.find((t) => t.id === id);
    if (!title) {
      throw new Error(`Anime with ID "${id}" not found on provider.`);
    }
    return title;
  }

  async getSeasons(titleId: string): Promise<SeasonMetadata[]> {
    const title = await this.getAnime(titleId);
    return [
      {
        id: `${title.id}-s1`,
        titleId: title.id,
        seasonNumber: 1,
        name: 'Season 1',
        episodeCount: title.totalEpisodes || 12,
      },
    ];
  }

  async getEpisodes(titleId: string, seasonNumber: number = 1): Promise<EpisodeMetadata[]> {
    const title = await this.getAnime(titleId);
    const count = title.totalEpisodes || 12;
    const episodes: EpisodeMetadata[] = [];

    for (let i = 1; i <= count; i++) {
      episodes.push({
        id: `${title.id}-s${seasonNumber}-e${i}`,
        titleId: title.id,
        seasonNumber,
        episodeNumber: i,
        name: `Episode ${i}`,
        durationSeconds: 1440,
        thumbnailUrl: title.posterUrl,
      });
    }

    return episodes;
  }

  async getVariants(episodeId: string): Promise<DownloadVariant[]> {
    if (!episodeId || !episodeId.startsWith('mock-')) {
      throw new Error(`Episode "${episodeId}" not found on provider.`);
    }
    // Return direct authorized test URLs with multiple qualities & audio tracks
    return [
      {
        id: `${episodeId}-1080p-jp`,
        episodeId,
        quality: '1080p',
        audioTrack: 'Japanese (Original)',
        subtitles: ['English', 'Spanish'],
        directUrl: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4?ep=${episodeId}&res=1080p`,
        fileSizeBytes: 350000000,
        format: 'mp4',
      },
      {
        id: `${episodeId}-720p-jp`,
        episodeId,
        quality: '720p',
        audioTrack: 'Japanese (Original)',
        subtitles: ['English'],
        directUrl: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4?ep=${episodeId}&res=720p`,
        fileSizeBytes: 180000000,
        format: 'mp4',
      },
      {
        id: `${episodeId}-1080p-en`,
        episodeId,
        quality: '1080p',
        audioTrack: 'English Dub',
        subtitles: ['English SDH'],
        directUrl: `https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4?ep=${episodeId}&res=1080p-dub`,
        fileSizeBytes: 340000000,
        format: 'mp4',
      },
    ];
  }
}
