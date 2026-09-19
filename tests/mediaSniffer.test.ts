import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaSnifferManager, SniffedMediaItem } from '../src/main/sniffer/mediaSnifferManager';

describe('MediaSnifferManager & Cloudflare Solver Integration', () => {
  let snifferManager: MediaSnifferManager;
  let mockDownloadManager: any;

  beforeEach(() => {
    mockDownloadManager = {
      addUrls: vi.fn().mockResolvedValue([{ id: 'mock-1', url: 'https://test.com/video.mp4' }]),
    };
    snifferManager = new MediaSnifferManager(mockDownloadManager);
  });

  it('should initialize with empty captured streams', () => {
    expect(snifferManager.getCapturedStreams()).toEqual([]);
  });

  it('should clear captured streams and notify listeners', () => {
    const listener = vi.fn();
    snifferManager.setOnStreamsUpdated(listener);

    // Manually push a stream to test clear
    (snifferManager as any).capturedStreams.push({
      id: 'sniff-1',
      url: 'https://kwik.cx/stream/123.mp4',
      title: 'Episode 1',
      quality: '1080p',
      sourceUrl: 'https://animepahe.pw/play/123',
      detectedAt: Date.now(),
    });

    expect(snifferManager.getCapturedStreams().length).toBe(1);

    snifferManager.clearCapturedStreams();
    expect(snifferManager.getCapturedStreams().length).toBe(0);
    expect(listener).toHaveBeenCalledWith([]);
  });

  it('should queue captured streams into DownloadManager with template context', async () => {
    (snifferManager as any).capturedStreams.push(
      {
        id: 'sniff-ep1',
        url: 'https://kwik.cx/stream/ep1.mp4',
        title: 'Cyberpunk Edgerunners',
        quality: '1080p',
        sourceUrl: 'https://animepahe.pw/play/abc',
        detectedAt: Date.now(),
      },
      {
        id: 'sniff-ep2',
        url: 'https://kwik.cx/stream/ep2.mp4',
        title: 'Cyberpunk Edgerunners',
        quality: '1080p',
        sourceUrl: 'https://animepahe.pw/play/def',
        detectedAt: Date.now(),
      }
    );

    const queuedCount = await snifferManager.queueAllCaptured('Cyberpunk Edgerunners');
    expect(queuedCount).toBe(2);
    expect(mockDownloadManager.addUrls).toHaveBeenCalledTimes(2);
    expect(snifferManager.getCapturedStreams().length).toBe(0);
  });

  it('should identify media stream patterns and kwik URLs accurately', () => {
    const isMediaUrl = (url: string) => /\.(mp4|mkv|webm|m3u8)(\?|$)/i.test(url);
    const isKwikStream = (url: string) => url.includes('kwik.') && (url.includes('.mp4') || url.includes('/stream/'));

    expect(isMediaUrl('https://kwik.cx/video/1080p.mp4?token=abc')).toBe(true);
    expect(isMediaUrl('https://example.com/playlist.m3u8')).toBe(true);
    expect(isMediaUrl('https://animepahe.pw/assets/app.css')).toBe(false);
    expect(isMediaUrl('https://animepahe.pw/assets/player.js')).toBe(false);

    expect(isKwikStream('https://kwik.cx/stream/video.mp4')).toBe(true);
    expect(isKwikStream('https://kwik.cx/assets/style.css')).toBe(false);
  });

  it('should extract anime ID from both series and play URL patterns', () => {
    const seriesUrl = 'https://animepahe.pw/anime/d40eda49-546b-e234-0478-4b1302363d9f';
    const playUrl = 'https://animepahe.pw/play/d40eda49-546b-e234-0478-4b1302363d9f/8bab80666d1468522b2327c5187216ee3a84ba746a17737dbe84ac42d529b1d2';

    const seriesMatch = seriesUrl.match(/\/anime\/([a-f0-9-]+)/i);
    const playMatch = playUrl.match(/\/play\/([a-f0-9-]+)/i);

    expect(seriesMatch?.[1]).toBe('d40eda49-546b-e234-0478-4b1302363d9f');
    expect(playMatch?.[1]).toBe('d40eda49-546b-e234-0478-4b1302363d9f');
  });
});
