import http from 'http';
import https from 'https';
import { URL } from 'url';
import { Readable } from 'stream';

export interface HttpResponse {
  statusCode: number;
  headers: http.IncomingHttpHeaders;
  stream: Readable;
  finalUrl: string;
  abort: () => void;
}

export interface HttpRequestOptions {
  rangeStart?: number;
  rangeEnd?: number;
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
}

export class HttpClient {
  private static cloudflareCookies: string = '';
  private static customUserAgent: string =
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36';

  public static setCloudflareCookies(cookieStr: string, userAgent?: string): void {
    HttpClient.cloudflareCookies = cookieStr.trim();
    if (userAgent && userAgent.trim()) {
      HttpClient.customUserAgent = userAgent.trim();
    }
  }

  public static getCloudflareCookies(): string {
    return HttpClient.cloudflareCookies;
  }

  public static getCustomUserAgent(): string {
    return HttpClient.customUserAgent;
  }

  static isRetryableStatusCode(statusCode: number): boolean {
    return statusCode === 429 || (statusCode >= 500 && statusCode <= 504);
  }

  static isRetryableError(err: any): boolean {
    if (!err) return false;
    const code = err.code;
    const retryableCodes = [
      'ECONNRESET',
      'ETIMEDOUT',
      'ECONNREFUSED',
      'EAI_AGAIN',
      'ENOTFOUND',
      'EHOSTUNREACH',
      'ENETUNREACH',
      'EPIPE',
      'UND_ERR_CONNECT_TIMEOUT',
      'UND_ERR_SOCKET',
    ];
    return retryableCodes.includes(code) || err.message?.includes('timed out');
  }

  static async get(urlStr: string, options: HttpRequestOptions = {}): Promise<HttpResponse> {
    const {
      rangeStart,
      rangeEnd,
      timeoutMs = 15000,
      maxRedirects = 5,
      headers = {},
    } = options;

    let redirectCount = 0;

    return new Promise((resolve, reject) => {
      function send(targetUrl: string) {
        let parsedUrl: URL;
        try {
          parsedUrl = new URL(targetUrl);
        } catch (err: any) {
          return reject(new Error(`Invalid URL: ${targetUrl}`));
        }

        const client = parsedUrl.protocol === 'https:' ? https : http;
        const reqHeaders: Record<string, string> = {
          'User-Agent': HttpClient.customUserAgent,
          'Accept': '*/*',
          ...headers,
        };

        if (parsedUrl.hostname.includes('kwik')) {
          reqHeaders['Referer'] = reqHeaders['Referer'] || 'https://kwik.cx/';
        } else if (parsedUrl.hostname.includes('animepahe')) {
          reqHeaders['Referer'] = reqHeaders['Referer'] || 'https://animepahe.pw/';
        }

        if (HttpClient.cloudflareCookies && (parsedUrl.hostname.includes('animepahe') || parsedUrl.hostname.includes('kwik'))) {
          reqHeaders['Cookie'] = HttpClient.cloudflareCookies;
        }

        if (typeof rangeStart === 'number' && rangeStart > 0) {
          reqHeaders['Range'] = typeof rangeEnd === 'number'
            ? `bytes=${rangeStart}-${rangeEnd}`
            : `bytes=${rangeStart}-`;
        }

        const req = client.request(
          parsedUrl,
          {
            method: 'GET',
            headers: reqHeaders,
            timeout: timeoutMs,
          },
          (res) => {
            const statusCode = res.statusCode || 200;

            // Handle redirect
            if ([301, 302, 303, 307, 308].includes(statusCode) && res.headers.location) {
              if (redirectCount >= maxRedirects) {
                res.resume();
                return reject(new Error(`Too many redirects (limit: ${maxRedirects})`));
              }
              redirectCount++;
              const nextUrl = new URL(res.headers.location, targetUrl).toString();
              res.resume();
              return send(nextUrl);
            }

            resolve({
              statusCode,
              headers: res.headers,
              stream: res,
              finalUrl: targetUrl,
              abort: () => {
                req.destroy();
                res.destroy();
              },
            });
          }
        );

        req.on('timeout', () => {
          req.destroy(new Error(`Connection timed out after ${timeoutMs}ms`));
        });

        req.on('error', (err) => {
          reject(err);
        });

        req.end();
      }

      send(urlStr);
    });
  }
}
