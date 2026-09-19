import { describe, it, expect } from 'vitest';
import { DownloadManager } from '../src/main/downloader/DownloadManager';

describe('URL Validation & Protocol Rejection', () => {
  it('should accept valid http URLs', () => {
    const res = DownloadManager.validateUrl('http://example.com/file.zip');
    expect(res.valid).toBe(true);
    expect(res.parsedUrl?.hostname).toBe('example.com');
  });

  it('should accept valid https URLs', () => {
    const res = DownloadManager.validateUrl('https://secure.example.org/path/media.mp4?key=val');
    expect(res.valid).toBe(true);
    expect(res.parsedUrl?.hostname).toBe('secure.example.org');
  });

  it('should reject unsupported protocols (ftp, file, javascript, ws)', () => {
    const ftpRes = DownloadManager.validateUrl('ftp://example.com/file.zip');
    expect(ftpRes.valid).toBe(false);
    expect(ftpRes.error).toContain('Unsupported protocol');

    const fileRes = DownloadManager.validateUrl('file:///C:/secrets.txt');
    expect(fileRes.valid).toBe(false);
    expect(fileRes.error).toContain('Unsupported protocol');

    const jsRes = DownloadManager.validateUrl('javascript:alert(1)');
    expect(jsRes.valid).toBe(false);

    const wsRes = DownloadManager.validateUrl('ws://chat.example.com');
    expect(wsRes.valid).toBe(false);
  });

  it('should reject malformed and empty URLs', () => {
    expect(DownloadManager.validateUrl('').valid).toBe(false);
    expect(DownloadManager.validateUrl('   ').valid).toBe(false);
    expect(DownloadManager.validateUrl('not-a-valid-url').valid).toBe(false);
  });
});
