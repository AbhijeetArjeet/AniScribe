import { BrowserWindow, session, ipcMain, WebContents } from 'electron';
import path from 'path';
import { DownloadManager } from '../downloader/DownloadManager';
import { TemplateContext } from '../../shared/types/settings';
import { HttpClient } from '../network/HttpClient';

export interface SniffedMediaItem {
  id: string;
  url: string;
  title: string;
  quality?: string;
  sourceUrl: string;
  detectedAt: number;
}

export class MediaSnifferManager {
  private snifferWindow: BrowserWindow | null = null;
  private capturedStreams: SniffedMediaItem[] = [];
  private downloadManager: DownloadManager | null = null;
  private onStreamsUpdatedCallback?: (streams: SniffedMediaItem[]) => void;

  constructor(downloadManager?: DownloadManager) {
    this.downloadManager = downloadManager || null;
  }

  public setDownloadManager(dm: DownloadManager): void {
    this.downloadManager = dm;
  }

  public setOnStreamsUpdated(cb: (streams: SniffedMediaItem[]) => void): void {
    this.onStreamsUpdatedCallback = cb;
  }

  public getCapturedStreams(): SniffedMediaItem[] {
    return this.capturedStreams;
  }

  public clearCapturedStreams(): void {
    this.capturedStreams = [];
    if (this.onStreamsUpdatedCallback) {
      this.onStreamsUpdatedCallback([]);
    }
  }

  /**
   * Opens the interactive in-app browser window for Cloudflare solving, manual navigation,
   * and network media sniffing.
   */
  public openBrowser(targetUrl: string = 'https://animepahe.pw'): BrowserWindow {
    if (this.snifferWindow && !this.snifferWindow.isDestroyed()) {
      this.snifferWindow.focus();
      if (targetUrl) {
        this.snifferWindow.loadURL(targetUrl);
      }
      return this.snifferWindow;
    }

    const snifferSession = session.fromPartition('persist:aniscribe_sniffer');

    // Attach webRequest network interceptor to sniff media streams
    this.attachMediaSniffer(snifferSession);

    this.snifferWindow = new BrowserWindow({
      width: 1150,
      height: 780,
      minWidth: 800,
      minHeight: 600,
      title: 'AniScribe — Cloudflare Solver & Media Sniffer',
      autoHideMenuBar: true,
      webPreferences: {
        session: snifferSession,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        preload: path.join(__dirname, '../preload/snifferPreload.js'),
      },
    });

    const defaultUa = this.snifferWindow.webContents.getUserAgent();
    const cleanUa = defaultUa
      .replace(/Electron\/[0-9.]+\s?/g, '')
      .replace(/AniScribe\/[0-9.]+\s?/g, '');
    this.snifferWindow.webContents.setUserAgent(cleanUa);

    // Inject floating controller toolbar when pages load
    this.snifferWindow.webContents.on('did-finish-load', () => {
      this.injectFloatingToolbar(this.snifferWindow!.webContents);
    });

    this.snifferWindow.on('closed', () => {
      this.snifferWindow = null;
    });

    this.snifferWindow.loadURL(targetUrl);
    return this.snifferWindow;
  }

  /**
   * Sets manual Cloudflare cf_clearance cookies into both HttpClient and Electron session
   */
  public async setClearanceCookie(cookieValue: string, userAgent?: string): Promise<boolean> {
    const snifferSession = session.fromPartition('persist:aniscribe_sniffer');
    try {
      const cleanVal = cookieValue.trim();
      const ua = userAgent?.trim() || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

      // Store in HttpClient so all RangeDownloader and API requests use it
      HttpClient.setCloudflareCookies(cleanVal, ua);

      // Parse individual cookie key-values and store in session
      const pairs = cleanVal.split(';');
      for (const pair of pairs) {
        const idx = pair.indexOf('=');
        if (idx > 0) {
          const name = pair.slice(0, idx).trim();
          const value = pair.slice(idx + 1).trim();
          if (name && value) {
            await snifferSession.cookies.set({
              url: 'https://animepahe.pw',
              name,
              value,
              domain: '.animepahe.pw',
              path: '/',
              secure: true,
              sameSite: 'no_restriction',
            }).catch(() => {});
          }
        }
      }

      console.log('[MediaSniffer] Set manual Cloudflare cookies in HttpClient and session');
      if (this.snifferWindow && !this.snifferWindow.isDestroyed()) {
        this.snifferWindow.reload();
      }
      return true;
    } catch (err: any) {
      console.error('[MediaSniffer] Error setting cookie:', err.message);
      return false;
    }
  }

  /**
   * Sniffs network headers for video streams (.mp4, .mkv, .m3u8, video/*)
   * and ensures required Referer/Origin headers are attached without tampering with Cloudflare Turnstile.
   */
  private attachMediaSniffer(ses: Electron.Session): void {
    const filter = { urls: ['*://*/*'] };

    // Only inject Referer for actual media stream downloads, NOT for Cloudflare challenges or page requests
    ses.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
      const requestHeaders = { ...details.requestHeaders };
      const url = details.url;

      const isMedia =
        url.includes('.mp4') ||
        url.includes('.m3u8') ||
        url.includes('/stream/') ||
        url.includes('/d/');

      if (url.includes('kwik.') && isMedia) {
        requestHeaders['Referer'] = 'https://kwik.cx/';
      }

      callback({ requestHeaders });
    });

    ses.webRequest.onHeadersReceived(filter, (details, callback) => {
      const headers = details.responseHeaders || {};
      const contentType = (
        headers['content-type']?.[0] ||
        headers['Content-Type']?.[0] ||
        ''
      ).toLowerCase();
      const url = details.url;

      const isVideoType =
        contentType.includes('video/') ||
        contentType.includes('application/x-mpegurl') ||
        contentType.includes('application/vnd.apple.mpegurl');

      const isMediaUrl = /\.(mp4|mkv|webm|m3u8)(\?|$)/i.test(url);
      const isKwikStream = url.includes('kwik.') && (url.includes('.mp4') || isVideoType);

      if ((isVideoType || isMediaUrl || isKwikStream) && !url.includes('.css') && !url.includes('.js')) {
        // Prevent duplicate streams in captured list
        if (!this.capturedStreams.some((s) => s.url === url)) {
          const pageTitle = this.snifferWindow && !this.snifferWindow.isDestroyed()
            ? this.snifferWindow.getTitle()
            : 'Captured Video';

          // Extract resolution if present (e.g. 1080p, 720p)
          const qualityMatch = url.match(/(1080p|720p|480p|360p)/i) || pageTitle.match(/(1080p|720p|480p|360p)/i);
          const quality = qualityMatch ? qualityMatch[1] : 'Direct Stream';

          const item: SniffedMediaItem = {
            id: `sniff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            url,
            title: pageTitle.replace(/ - AnimePahe.*$/i, '').trim(),
            quality,
            sourceUrl: details.referrer || url,
            detectedAt: Date.now(),
          };

          this.capturedStreams.unshift(item);
          console.log(`[MediaSniffer] Intercepted media stream: ${item.title} [${item.quality}] -> ${url}`);

          if (this.onStreamsUpdatedCallback) {
            this.onStreamsUpdatedCallback([...this.capturedStreams]);
          }

          // Update floating toolbar in browser window
          if (this.snifferWindow && !this.snifferWindow.isDestroyed()) {
            this.snifferWindow.webContents.send('aniscribe:streamCaptured', item);
          }
        }
      }

      callback({ responseHeaders: details.responseHeaders });
    });
  }

  /**
   * Injects an in-page floating toolbar into the browser window allowing the user
   * to immediately queue sniffed videos, trigger batch episode extraction, or solve Cloudflare.
   */
  private injectFloatingToolbar(wc: WebContents): void {
    const script = `
      (function() {
        if (document.getElementById('aniscribe-sniffer-toolbar')) return;

        const bar = document.createElement('div');
        bar.id = 'aniscribe-sniffer-toolbar';
        bar.style.cssText = 'position:fixed;top:0;left:0;right:0;height:44px;background:#0f172a;color:#f8fafc;z-index:2147483647;display:flex;align-items:center;justify-content:space-between;padding:0 16px;font-family:system-ui,sans-serif;font-size:13px;border-bottom:2px solid #6366f1;box-shadow:0 4px 12px rgba(0,0,0,0.5);';

        const leftSection = document.createElement('div');
        leftSection.style.cssText = 'display:flex;align-items:center;gap:12px;';
        leftSection.innerHTML = '<span style="font-weight:700;color:#818cf8;display:flex;align-items:center;gap:6px;">🎬 AniScribe Sniffer</span><span id="aniscribe-status" style="background:#1e293b;padding:2px 8px;border-radius:12px;font-size:11px;color:#38bdf8;">Listening for media & Kwik streams...</span>';

        const rightSection = document.createElement('div');
        rightSection.style.cssText = 'display:flex;align-items:center;gap:10px;';

        const cookieBtn = document.createElement('button');
        cookieBtn.innerText = '🔑 Set Cookie';
        cookieBtn.style.cssText = 'background:#1e293b;color:#cbd5e1;border:1px solid #475569;padding:6px 12px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
        cookieBtn.title = 'Paste cf_clearance cookie from your regular browser';
        cookieBtn.onclick = function() {
          const val = prompt('Paste your Cloudflare cf_clearance cookie value from Chrome/Edge:');
          if (val && val.trim()) {
            if (window.aniscribeSniffer) {
              window.aniscribeSniffer.setCookie(val.trim());
              cookieBtn.innerText = '✓ Cookie Set!';
              setTimeout(() => { cookieBtn.innerText = '🔑 Set Cookie'; }, 2500);
            }
          }
        };

        const batchBtn = document.createElement('button');
        batchBtn.innerText = '⚡ Batch Extract Anime Episodes';
        batchBtn.style.cssText = 'background:#4f46e5;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;transition:background 0.2s;';
        batchBtn.onclick = function() {
          if (window.aniscribeSniffer) {
            window.aniscribeSniffer.batchExtract(window.location.href);
            batchBtn.innerText = '⏳ Extracting Series...';
            batchBtn.disabled = true;
          }
        };

        const queueBtn = document.createElement('button');
        queueBtn.id = 'aniscribe-queue-btn';
        queueBtn.innerText = '📥 Queue Captured (0)';
        queueBtn.style.cssText = 'background:#10b981;color:#fff;border:none;padding:6px 14px;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer;';
        queueBtn.onclick = function() {
          if (window.aniscribeSniffer) {
            window.aniscribeSniffer.queueAll();
            queueBtn.innerText = '✓ Queued!';
            setTimeout(() => { queueBtn.innerText = '📥 Queue Captured (0)'; }, 2000);
          }
        };

        rightSection.appendChild(cookieBtn);
        rightSection.appendChild(batchBtn);
        rightSection.appendChild(queueBtn);

        bar.appendChild(leftSection);
        bar.appendChild(rightSection);
        document.body.appendChild(bar);
        document.body.style.marginTop = '44px';
      })();
    `;
    wc.executeJavaScript(script).catch(() => {});
  }

  /**
   * Automatically crawls all episodes of an Animepahe anime series page (or play page)
   * and extracts their streaming/download URLs into AniScribe's queue.
   */
  public async batchExtractAnimepaheSeries(seriesUrl: string): Promise<{
    animeTitle: string;
    queuedCount: number;
    episodes: Array<{ episodeNumber: number; url: string; title: string }>;
  }> {
    const seriesMatch = seriesUrl.match(/\/anime\/([a-f0-9-]+)/i);
    const playMatch = seriesUrl.match(/\/play\/([a-f0-9-]+)/i);
    const animeId = seriesMatch ? seriesMatch[1] : (playMatch ? playMatch[1] : null);

    // 1. If Cloudflare cookies are configured in HttpClient, attempt direct API extraction first
    if (animeId && HttpClient.getCloudflareCookies()) {
      try {
        console.log(`[MediaSniffer] Attempting direct API extraction for anime ${animeId} with cookies...`);
        let page = 1;
        let lastPage = 1;
        const episodes: any[] = [];
        do {
          const apiRes = await HttpClient.get(`https://animepahe.pw/api?m=release&id=${animeId}&sort=episode_asc&page=${page}`);
          if (apiRes.statusCode === 200) {
            const body = await new Promise<string>((resolve, reject) => {
              let d = '';
              apiRes.stream.on('data', c => d += c);
              apiRes.stream.on('end', () => resolve(d));
              apiRes.stream.on('error', reject);
            });
            const data = JSON.parse(body);
            if (data && data.data && Array.isArray(data.data)) {
              lastPage = data.last_page || 1;
              for (const ep of data.data) {
                episodes.push({
                  episodeNumber: ep.episode,
                  session: ep.session,
                  href: `https://animepahe.pw/play/${animeId}/${ep.session}`,
                  title: `Anime - S01E${String(ep.episode).padStart(2, '0')}`,
                });
              }
            } else {
              break;
            }
          } else {
            break;
          }
          page++;
        } while (page <= lastPage);

        if (episodes.length > 0 && this.downloadManager) {
          console.log(`[MediaSniffer] Successfully extracted ${episodes.length} episodes via direct authenticated API!`);
          for (const ep of episodes) {
            await this.downloadManager.addUrls([ep.href], { title: 'Anime Series', episode: `S01E${String(ep.episodeNumber).padStart(2, '0')}` });
          }
          return { animeTitle: 'Anime Series', queuedCount: episodes.length, episodes };
        }
      } catch (err: any) {
        console.log('[MediaSniffer] Direct API extraction with cookies error, falling back to browser window:', err.message);
      }
    }

    // 2. Browser Window Extraction fallback
    const win = this.openBrowser(seriesUrl);

    // Wait for Cloudflare verification and page completion
    await new Promise<void>((resolve) => {
      const checkTitle = () => {
        if (!win || win.isDestroyed()) return resolve();
        const title = win.getTitle();
        if (!title.includes('Just a moment') && !title.includes('Attention Required')) {
          resolve();
        } else {
          setTimeout(checkTitle, 1000);
        }
      };
      setTimeout(checkTitle, 1500);
    });

    // Extract Anime ID and episode list from page, including paginated release API
    const extractScript = `
      (async function() {
        const titleEl = document.querySelector('.title-wrapper h1') || document.querySelector('h1') || document.querySelector('title');
        const animeTitle = titleEl ? titleEl.innerText.replace(/ - AnimePahe.*$/i, '').trim() : 'Anime';

        const episodeMap = [];

        // Check if current URL is an anime series page or an episode play page
        const seriesMatch = window.location.href.match(/\\/anime\\/([a-f0-9-]+)/i);
        const playMatch = window.location.href.match(/\\/play\\/([a-f0-9-]+)/i);
        const animeId = seriesMatch ? seriesMatch[1] : (playMatch ? playMatch[1] : null);

        if (animeId) {
          try {
            let currentPage = 1;
            let lastPage = 1;

            do {
              const res = await fetch('/api?m=release&id=' + animeId + '&sort=episode_asc&page=' + currentPage);
              const data = await res.json();
              if (data && data.data && Array.isArray(data.data)) {
                lastPage = data.last_page || 1;
                for (const ep of data.data) {
                  const playUrl = window.location.origin + '/play/' + animeId + '/' + ep.session;
                  if (!episodeMap.some(e => e.session === ep.session)) {
                    episodeMap.push({
                      episodeNumber: ep.episode,
                      session: ep.session,
                      href: playUrl,
                      title: animeTitle + ' - S01E' + String(ep.episode).padStart(2, '0')
                    });
                  }
                }
              } else {
                break;
              }
              currentPage++;
            } while (currentPage <= lastPage);
          } catch (err) {
            console.error('API release fetch error:', err);
          }
        }

        // If API wasn't reachable, fall back to DOM links
        if (episodeMap.length === 0) {
          const links = Array.from(document.querySelectorAll('a[href*="/play/"]'));
          for (const a of links) {
            const href = a.href;
            const text = a.innerText.trim();
            const epNumMatch = text.match(/(\\d+)/) || href.match(/\\/(\\d+)($|\\?)/);
            const epNum = epNumMatch ? parseInt(epNumMatch[1], 10) : (episodeMap.length + 1);
            if (!episodeMap.some(e => e.href === href)) {
              episodeMap.push({
                episodeNumber: epNum,
                session: href.split('/').pop(),
                href,
                title: animeTitle + ' - S01E' + String(epNum).padStart(2, '0')
              });
            }
          }
        }

        // On play page, extract Kwik links directly from download dropdown or buttons
        const kwikLinks = Array.from(document.querySelectorAll('a[href*="kwik."], a[href*="pahe."]') || [])
          .map(el => el.href)
          .filter(Boolean);

        return { animeTitle, episodes: episodeMap, kwikLinks };
      })();
    `;

    try {
      const data = await win.webContents.executeJavaScript(extractScript);
      const episodes = data.episodes || [];
      const animeTitle = data.animeTitle || 'Anime Series';

      console.log(`[MediaSniffer] Extracted ${episodes.length} episodes for "${animeTitle}"`);

      // Queue each episode into AniScribe DownloadManager
      const queuedEpisodes: Array<{ episodeNumber: number; url: string; title: string }> = [];

      if (this.downloadManager && episodes.length > 0) {
        for (const ep of episodes) {
          const templateContext: TemplateContext = {
            title: animeTitle,
            episode: `S01E${String(ep.episodeNumber).padStart(2, '0')}`,
            quality: '1080p',
          };

          // Queue the episode URL (will be processed via range downloader or resolved stream)
          await this.downloadManager.addUrls([ep.href], templateContext);
          queuedEpisodes.push({
            episodeNumber: ep.episodeNumber,
            url: ep.href,
            title: `${animeTitle} - S01E${String(ep.episodeNumber).padStart(2, '0')}`,
          });
        }
      }

      return {
        animeTitle,
        queuedCount: queuedEpisodes.length,
        episodes: queuedEpisodes,
      };
    } catch (err: any) {
      console.warn('[MediaSniffer] Batch extraction error:', err.message);
      return {
        animeTitle: 'Unknown Series',
        queuedCount: 0,
        episodes: [],
      };
    }
  }

  /**
   * Queues all currently captured media streams into DownloadManager
   */
  public async queueAllCaptured(customTitle?: string): Promise<number> {
    if (!this.downloadManager || this.capturedStreams.length === 0) {
      return 0;
    }

    let queuedCount = 0;
    for (let i = 0; i < this.capturedStreams.length; i++) {
      const item = this.capturedStreams[i];
      const epNum = this.capturedStreams.length - i;
      const templateContext: TemplateContext = {
        title: customTitle || item.title || 'Anime Video',
        episode: `S01E${String(epNum).padStart(2, '0')}`,
        quality: item.quality || '1080p',
      };

      try {
        await this.downloadManager.addUrls([item.url], templateContext);
        queuedCount++;
      } catch (e) {
        console.warn(`[MediaSniffer] Error queueing ${item.url}:`, e);
      }
    }

    this.clearCapturedStreams();
    return queuedCount;
  }
}
