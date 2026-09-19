import http from 'http';
import { AddressInfo } from 'net';

export interface TestServerOptions {
  content?: Buffer;
  supportRange?: boolean;
  rateLimitAttempts?: number; // return 429 this many times before 200
  retryAfterSeconds?: number;
  serverErrorAttempts?: number; // return 503 this many times before 200
  slowStream?: boolean; // send chunks with small delay
}

export class TestServer {
  private server: http.Server | null = null;
  public port: number = 0;
  public requestCount: number = 0;
  public receivedHeaders: http.IncomingHttpHeaders[] = [];
  public lastRequestedRange: string | undefined;

  async start(options: TestServerOptions = {}): Promise<string> {
    const {
      content = Buffer.from('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(100)), // 3.6 KB
      supportRange = true,
      rateLimitAttempts = 0,
      retryAfterSeconds = 1,
      serverErrorAttempts = 0,
      slowStream = false,
    } = options;

    let rateLimitRemaining = rateLimitAttempts;
    let serverErrorRemaining = serverErrorAttempts;

    return new Promise((resolve) => {
      this.server = http.createServer((req, res) => {
        this.requestCount++;
        this.receivedHeaders.push(req.headers);
        this.lastRequestedRange = req.headers['range'];

        // Handle HEAD metadata probe
        if (req.method === 'HEAD') {
          const headers: Record<string, string | number> = {
            'Content-Length': content.length,
            'Content-Type': 'application/octet-stream',
            'Content-Disposition': 'attachment; filename="testfile.bin"',
          };
          if (supportRange) {
            headers['Accept-Ranges'] = 'bytes';
          }
          res.writeHead(200, headers);
          res.end();
          return;
        }

        // Simulate 429 Too Many Requests
        if (rateLimitRemaining > 0) {
          rateLimitRemaining--;
          res.writeHead(429, {
            'Retry-After': String(retryAfterSeconds),
            'Content-Type': 'text/plain',
          });
          res.end('Too Many Requests');
          return;
        }

        // Simulate 503 Service Unavailable
        if (serverErrorRemaining > 0) {
          serverErrorRemaining--;
          res.writeHead(503, {
            'Retry-After': String(retryAfterSeconds),
            'Content-Type': 'text/plain',
          });
          res.end('Service Unavailable');
          return;
        }

        // Handle GET
        const rangeHeader = req.headers['range'];
        let chunkToSend: Buffer = content;
        let statusCode = 200;
        const headers: Record<string, string | number> = {
          'Content-Type': 'application/octet-stream',
          'Content-Disposition': 'attachment; filename="testfile.bin"',
        };

        if (supportRange) {
          headers['Accept-Ranges'] = 'bytes';
        }

        if (rangeHeader && supportRange) {
          const match = rangeHeader.match(/bytes=(\d+)-(\d+)?/);
          if (match) {
            const start = parseInt(match[1], 10);
            const end = match[2] ? parseInt(match[2], 10) : content.length - 1;

            if (start >= content.length) {
              res.writeHead(416, { 'Content-Range': `bytes */${content.length}` });
              res.end();
              return;
            }

            statusCode = 206;
            chunkToSend = content.subarray(start, end + 1);
            headers['Content-Range'] = `bytes ${start}-${end}/${content.length}`;
            headers['Content-Length'] = chunkToSend.length;
          }
        } else {
          headers['Content-Length'] = content.length;
        }

        res.writeHead(statusCode, headers);

        if (!slowStream) {
          res.end(chunkToSend);
        } else {
          // Stream in chunks with small delay
          const chunkSize = Math.max(128, Math.floor(chunkToSend.length / 10));
          let offset = 0;

          const sendNext = () => {
            if (res.writableEnded || res.destroyed) return;
            if (offset >= chunkToSend.length) {
              res.end();
              return;
            }
            const end = Math.min(offset + chunkSize, chunkToSend.length);
            const slice = chunkToSend.subarray(offset, end);
            res.write(slice);
            offset = end;
            setTimeout(sendNext, 40);
          };

          sendNext();
        }
      });

      this.server.listen(0, '127.0.0.1', () => {
        const addr = this.server!.address() as AddressInfo;
        this.port = addr.port;
        resolve(`http://127.0.0.1:${this.port}/testfile.bin`);
      });
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => resolve());
        this.server = null;
      } else {
        resolve();
      }
    });
  }
}
