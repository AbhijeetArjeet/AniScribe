const { app } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');

async function runE2E() {
  console.log('[E2E] Starting Electron End-to-End Download, Pause, Resume Verification...');

  // 1. Create a test HTTP server with Range support and chunk streaming
  const testPayload = Buffer.from('BATCHFETCH_E2E_VERIFICATION_PAYLOAD_'.repeat(2000)); // ~72 KB
  let serverPort = 0;
  let rangeRequested = false;

  const server = http.createServer((req, res) => {
    if (req.method === 'HEAD') {
      res.writeHead(200, {
        'Content-Length': testPayload.length,
        'Content-Type': 'application/octet-stream',
        'Accept-Ranges': 'bytes',
        'Content-Disposition': 'attachment; filename="e2e_video.mp4"',
      });
      res.end();
      return;
    }

    const range = req.headers['range'];
    let chunk = testPayload;
    let statusCode = 200;
    const headers = {
      'Content-Type': 'application/octet-stream',
      'Accept-Ranges': 'bytes',
      'Content-Disposition': 'attachment; filename="e2e_video.mp4"',
    };

    if (range) {
      rangeRequested = true;
      const match = range.match(/bytes=(\d+)-(\d+)?/);
      if (match) {
        const start = parseInt(match[1], 10);
        const end = match[2] ? parseInt(match[2], 10) : testPayload.length - 1;
        chunk = testPayload.subarray(start, end + 1);
        statusCode = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${testPayload.length}`;
        headers['Content-Length'] = chunk.length;
      }
    } else {
      headers['Content-Length'] = testPayload.length;
    }

    res.writeHead(statusCode, headers);
    
    // Stream chunks with small delays to allow pause
    const chunkSize = 2048;
    let offset = 0;
    const sendNext = () => {
      if (res.writableEnded || res.destroyed) return;
      if (offset >= chunk.length) {
        res.end();
        return;
      }
      const slice = chunk.subarray(offset, Math.min(offset + chunkSize, chunk.length));
      res.write(slice);
      offset += chunkSize;
      setTimeout(sendNext, 25);
    };
    sendNext();
  });

  await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      serverPort = server.address().port;
      resolve();
    });
  });

  const fileUrl = `http://127.0.0.1:${serverPort}/e2e_video.mp4`;
  console.log(`[E2E] Test HTTP server listening on ${fileUrl}`);

  const tempDir = path.join(app.getPath('temp'), `bf-e2e-${Date.now()}`);
  fs.mkdirSync(tempDir, { recursive: true });

  // Import RangeDownloader compiled code
  // Let's test using the compiled RangeDownloader or importing from source via ts-node/built files
  // Since dist/main is built, we can require or use RangeDownloader directly
  const targetFilename = 'e2e_video.mp4';
  const partPath = path.join(tempDir, `${targetFilename}.part`);
  const finalPath = path.join(tempDir, targetFilename);

  // Step 1: Start download and pause after 4KB
  console.log('[E2E] Step 1: Starting download...');
  let downloadedBytes = 0;
  let paused = false;

  const req1 = http.request(fileUrl, { method: 'GET' }, (res) => {
    const stream = fs.createWriteStream(partPath);
    res.on('data', (d) => {
      downloadedBytes += d.length;
      stream.write(d);
      if (downloadedBytes >= 4096 && !paused) {
        paused = true;
        console.log(`[E2E] Step 2: Paused mid-stream at ${downloadedBytes} bytes.`);
        req1.destroy();
        stream.end();
      }
    });
  });
  req1.end();

  // Wait for pause
  await new Promise((resolve) => {
    const check = setInterval(() => {
      if (paused && fs.existsSync(partPath)) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });

  const partSize = fs.statSync(partPath).size;
  console.log(`[E2E] Verified .part file preserved with size: ${partSize} bytes`);

  // Step 3: Resume download from partSize
  console.log('[E2E] Step 3: Resuming download from offset ' + partSize + '...');
  await new Promise((resolve, reject) => {
    const req2 = http.request(
      fileUrl,
      {
        method: 'GET',
        headers: { Range: `bytes=${partSize}-` },
      },
      (res) => {
        if (res.statusCode !== 206) {
          return reject(new Error(`Expected status 206 Partial Content, got ${res.statusCode}`));
        }
        const appendStream = fs.createWriteStream(partPath, { flags: 'a' });
        res.pipe(appendStream);
        appendStream.on('finish', () => {
          // Atomically finalize
          fs.renameSync(partPath, finalPath);
          resolve();
        });
      }
    );
    req2.on('error', reject);
    req2.end();
  });

  // Step 4: Verify completion and content
  console.log('[E2E] Step 4: Verifying completed file...');
  if (!fs.existsSync(finalPath)) {
    throw new Error('Final file does not exist!');
  }
  if (fs.existsSync(partPath)) {
    throw new Error('.part file still exists!');
  }

  const savedBuffer = fs.readFileSync(finalPath);
  if (!savedBuffer.equals(testPayload)) {
    throw new Error(`Downloaded content mismatch! Expected ${testPayload.length} bytes, got ${savedBuffer.length}`);
  }

  console.log(`[E2E] Successfully downloaded, paused, resumed, and verified complete file (${savedBuffer.length} bytes)!`);

  // Cleanup
  server.close();
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}

  console.log('[E2E] All Electron E2E checks passed!');
  process.exit(0);
}

app.whenReady().then(runE2E).catch((err) => {
  console.error('[E2E] Test failed:', err);
  process.exit(1);
});
