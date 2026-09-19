import http from 'http';
import https from 'https';
import { URL } from 'url';

export interface RemoteMetadata {
  url: string;
  finalUrl: string;
  statusCode: number;
  contentLength: number;
  acceptRanges: boolean;
  contentType?: string;
  suggestedFilename?: string;
  etag?: string;
  lastModified?: string;
}

export function extractFilenameFromContentDisposition(header: string | undefined): string | null {
  if (!header) return null;

  // Check for RFC 5987 filename*=UTF-8''filename.ext
  const utf8Match = header.match(/filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim().replace(/['"]/g, ''));
    } catch {
      return utf8Match[1].trim().replace(/['"]/g, '');
    }
  }

  // Check for regular filename="filename.ext"
  const match = header.match(/filename\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if (match) {
    const filename = match[1] || match[2];
    if (filename) {
      return filename.trim().replace(/^["']|["']$/g, '');
    }
  }

  return null;
}

export function extractFilenameFromUrl(rawUrl: string): string {
  try {
    const parsed = new URL(rawUrl);
    const pathname = parsed.pathname;
    const segments = pathname.split('/').filter(Boolean);
    if (segments.length > 0) {
      const last = segments[segments.length - 1];
      const decoded = decodeURIComponent(last);
      // Strip query or fragment if left
      const clean = decoded.split(/[?#]/)[0].trim();
      if (clean && clean !== '.' && clean !== '..') {
        return clean;
      }
    }
  } catch {
    // fallback below
  }
  return 'download.bin';
}

/**
 * Probes the URL with HEAD (or GET range=0-0) to get metadata
 */
export async function probeMetadata(
  targetUrl: string,
  timeoutMs: number = 10000,
  maxRedirects: number = 5
): Promise<RemoteMetadata> {
  return new Promise((resolve, reject) => {
    let currentUrl = targetUrl;
    let redirectCount = 0;

    function executeRequest(urlStr: string) {
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(urlStr);
      } catch (err: any) {
        return reject(new Error(`Invalid URL: ${urlStr}`));
      }

      const client = parsedUrl.protocol === 'https:' ? https : http;
      const options: http.RequestOptions = {
        method: 'HEAD',
        timeout: timeoutMs,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) BatchFetch/1.0',
          'Accept': '*/*',
        },
      };

      const req = client.request(parsedUrl, options, (res) => {
        // Handle redirects
        if (
          res.statusCode &&
          [301, 302, 303, 307, 308].includes(res.statusCode) &&
          res.headers.location &&
          redirectCount < maxRedirects
        ) {
          redirectCount++;
          const nextUrl = new URL(res.headers.location, urlStr).toString();
          res.resume(); // consume stream
          return executeRequest(nextUrl);
        }

        const acceptRanges = res.headers['accept-ranges'] === 'bytes';
        const contentLength = parseInt(res.headers['content-length'] || '0', 10);
        const contentType = res.headers['content-type'];
        const contentDisposition = res.headers['content-disposition'];
        const suggestedFilename =
          extractFilenameFromContentDisposition(contentDisposition) ||
          extractFilenameFromUrl(urlStr);

        res.resume();

        resolve({
          url: targetUrl,
          finalUrl: urlStr,
          statusCode: res.statusCode || 200,
          contentLength: isNaN(contentLength) ? 0 : contentLength,
          acceptRanges,
          contentType,
          suggestedFilename,
          etag: res.headers.etag,
          lastModified: res.headers['last-modified'],
        });
      });

      req.on('timeout', () => {
        req.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
      });

      req.on('error', (err) => {
        reject(err);
      });

      req.end();
    }

    executeRequest(currentUrl);
  });
}
