import { protocol, net } from 'electron';
import { pathToFileURL } from 'url';
import path from 'path';
import fs from 'fs';

export function registerMediaSchemesAsPrivileged(): void {
  try {
    protocol.registerSchemesAsPrivileged([
      {
        scheme: 'media',
        privileges: {
          standard: true,
          secure: true,
          bypassCSP: true,
          supportFetchAPI: true,
          corsEnabled: true,
          stream: true,
        },
      },
    ]);
  } catch (err: any) {
    // Already registered or in test environment
  }
}

export function registerMediaProtocol(): void {
  protocol.handle('media', async (request) => {
    try {
      const url = new URL(request.url);
      // media://local/C:/Path/To/Video.mp4
      let decodedPath = decodeURIComponent(url.pathname);
      
      // On Windows, strip leading slash before drive letter: /C:/path -> C:/path
      if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(decodedPath)) {
        decodedPath = decodedPath.slice(1);
      }

      const cleanPath = path.normalize(decodedPath);

      if (!fs.existsSync(cleanPath) || !fs.statSync(cleanPath).isFile()) {
        return new Response('Media file not found', { status: 404 });
      }

      // Convert local path to file:// URL and fetch with Range support
      const fileUrl = pathToFileURL(cleanPath).toString();
      return await net.fetch(fileUrl, {
        headers: request.headers,
        bypassCustomProtocolHandlers: true,
      });
    } catch (err: any) {
      console.error('[MediaProtocol] Error streaming media:', err);
      return new Response('Error loading media file', { status: 500 });
    }
  });
}
