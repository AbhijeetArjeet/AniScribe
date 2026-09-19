import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import http from 'http';
import { AddressInfo } from 'net';
import { MockProvider } from '../src/main/provider/MockProvider';
import { AuthorizedProviderAdapter } from '../src/main/provider/ProviderAdapter';
import { ProviderRegistry } from '../src/main/provider/ProviderRegistry';
import { ProviderManager } from '../src/main/provider/ProviderManager';

describe('Strengthened Provider Framework & Registry', () => {
  let server: http.Server;
  let serverPort: number;

  beforeEach(async () => {
    server = http.createServer((req, res) => {
      const url = req.url || '';
      res.setHeader('Content-Type', 'application/json');

      if (url === '/search?q=demon') {
        res.writeHead(200);
        res.end(
          JSON.stringify([
            {
              id: 'demon-1',
              title: 'Demon Slayer',
              authorizedSource: 'RemoteAPI',
            },
          ])
        );
        return;
      }

      if (url === '/titles/demon-1') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            id: 'demon-1',
            title: 'Demon Slayer',
            totalEpisodes: 26,
            authorizedSource: 'RemoteAPI',
          })
        );
        return;
      }

      if (url === '/titles/demon-1/seasons') {
        res.writeHead(200);
        res.end(
          JSON.stringify([
            {
              id: 'demon-1-s1',
              titleId: 'demon-1',
              seasonNumber: 1,
              name: 'Tanjiro Kamado, Unwavering Resolve Arc',
              episodeCount: 26,
            },
          ])
        );
        return;
      }

      if (url === '/titles/demon-1/episodes') {
        res.writeHead(200);
        res.end(
          JSON.stringify([
            {
              id: 'demon-ep-1',
              titleId: 'demon-1',
              seasonNumber: 1,
              episodeNumber: 1,
              name: 'Cruelty',
              durationSeconds: 1440,
            },
          ])
        );
        return;
      }

      if (url === '/episodes/demon-ep-1/variants') {
        res.writeHead(200);
        res.end(
          JSON.stringify([
            {
              id: 'var-1',
              episodeId: 'demon-ep-1',
              quality: '1080p',
              audioTrack: 'Original',
              subtitles: ['English'],
              directUrl: `http://127.0.0.1:${serverPort}/stream.mp4`,
              format: 'mp4',
            },
          ])
        );
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

  it('should query MockProvider offline without network dependencies', async () => {
    const mock = new MockProvider();
    const results = await mock.searchAnime('cyberpunk');
    expect(results.length).toBe(1);
    expect(results[0].title).toContain('Cyberpunk');

    const seasons = await mock.getSeasons('mock-cyberpunk');
    expect(seasons.length).toBe(1);
    expect(seasons[0].seasonNumber).toBe(1);

    const episodes = await mock.getEpisodes('mock-cyberpunk', 1);
    expect(episodes.length).toBe(10);
    expect(episodes[0].episodeNumber).toBe(1);

    const variants = await mock.getVariants(episodes[0].id);
    expect(variants.length).toBeGreaterThan(0);
    expect(variants[0].directUrl).toBeDefined();
    expect(variants[0].directUrl.startsWith('https://')).toBe(true);
  });

  it('should manage provider adapters via ProviderRegistry and ProviderManager', async () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);

    // Initial registry should have mock provider
    const providers = manager.getProviders();
    expect(providers.length).toBeGreaterThanOrEqual(1);
    expect(providers.some((p) => p.isMock)).toBe(true);

    // Register remote authorized adapter
    const remoteAdapter = new AuthorizedProviderAdapter(
      `http://127.0.0.1:${serverPort}`,
      undefined,
      'test-remote',
      'Test Remote API'
    );
    registry.register(remoteAdapter);

    const updatedProviders = manager.getProviders();
    expect(updatedProviders.length).toBe(providers.length + 1);

    // Search via manager targeting remote provider
    const searchResults = await manager.search('demon', 'test-remote');
    expect(searchResults.length).toBe(1);
    expect(searchResults[0].title).toBe('Demon Slayer');

    // Get full anime with seasons and episodes
    const animeDetails = await manager.getAnime('demon-1', 'test-remote');
    expect(animeDetails.title.title).toBe('Demon Slayer');
    expect(animeDetails.seasons.length).toBe(1);
    expect(animeDetails.episodes.length).toBe(1);

    // Get variants
    const variants = await manager.getVariants('demon-ep-1', 'test-remote');
    expect(variants.length).toBe(1);
    expect(variants[0].quality).toBe('1080p');
  });

  it('should handle provider errors gracefully without crashing', async () => {
    const registry = new ProviderRegistry();
    const manager = new ProviderManager(registry);

    // Non-existent search returns empty array
    const empty = await manager.search('non-existent-xyz');
    expect(empty).toEqual([]);

    // Get variants for non-existent episode returns empty array
    const badVariants = await manager.getVariants('non-existent-ep');
    expect(badVariants).toEqual([]);
  });
});
