import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { AuthorizedProviderAdapter } from '../src/main/provider/ProviderAdapter';
import { TitleMetadata, Episode, DownloadVariant } from '../src/shared/types/provider';

describe('Authorized ProviderAdapter Integration', () => {
  let server: http.Server;
  let serverPort: number;

  const mockTitle: TitleMetadata = {
    id: 'series-42',
    title: 'Open Frontier',
    description: 'Documentary Series',
    totalEpisodes: 12,
    authorizedSource: 'PublicMediaAPI',
  };

  const mockEpisodes: Episode[] = [
    {
      id: 'ep-1',
      titleId: 'series-42',
      seasonNumber: 1,
      episodeNumber: 1,
      name: 'Episode 1: The Beginning',
      durationSeconds: 1440,
    },
  ];

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      const url = req.url || '';
      res.setHeader('Content-Type', 'application/json');

      if (url === '/titles/series-42') {
        res.writeHead(200);
        res.end(JSON.stringify(mockTitle));
        return;
      }

      if (url === '/titles/series-42/episodes') {
        res.writeHead(200);
        res.end(JSON.stringify(mockEpisodes));
        return;
      }

      if (url === '/episodes/ep-1/variants') {
        const mockVariants: DownloadVariant[] = [
          {
            id: 'var-1080',
            episodeId: 'ep-1',
            quality: '1080p',
            audioTrack: 'Original',
            subtitles: ['English', 'None'],
            directUrl: `http://127.0.0.1:${serverPort}/media/ep1_1080p.mp4`,
            format: 'mp4',
          },
          {
            id: 'var-720',
            episodeId: 'ep-1',
            quality: '720p',
            audioTrack: 'Original',
            subtitles: ['English'],
            directUrl: `http://127.0.0.1:${serverPort}/media/ep1_720p.mp4`,
            format: 'mp4',
          },
        ];
        res.writeHead(200);
        res.end(JSON.stringify(mockVariants));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'Not found' }));
    });

    await new Promise<void>((resolve) => {
      server.listen(0, '127.0.0.1', () => {
        serverPort = (server.address() as AddressInfo).port;
        resolve();
      });
    });
  });

  afterEach(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('should fetch authorized metadata, episodes, and direct download variants', async () => {
    const provider = new AuthorizedProviderAdapter(`http://127.0.0.1:${serverPort}`, 'test-token');

    const title = await provider.getTitle('series-42');
    expect(title.id).toBe('series-42');
    expect(title.title).toBe('Open Frontier');

    const episodes = await provider.getEpisodes('series-42');
    expect(episodes.length).toBe(1);
    expect(episodes[0].name).toContain('Episode 1');

    const variants = await provider.getVariants('ep-1');
    expect(variants.length).toBe(2);
    expect(variants[0].quality).toBe('1080p');
    expect(variants[0].directUrl).toContain('/media/ep1_1080p.mp4');
  });
});
