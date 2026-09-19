import { describe, it, expect } from 'vitest';
import path from 'path';
import { sanitizeFilename } from '../src/main/utils/filename';
import { DownloadManager } from '../src/main/downloader/DownloadManager';
import { ExportManager } from '../src/main/export/exportManager';

describe('Security & Isolation Audit', () => {
  it('should block directory traversal attacks in filenames', () => {
    const malicious = '../../../../windows/system32/cmd.exe';
    const sanitized = sanitizeFilename(malicious);
    expect(sanitized).not.toContain('..');
    expect(sanitized).not.toContain('/');
    expect(sanitized).not.toContain('\\');
  });

  it('should sanitize special characters and reserved device names on Windows', () => {
    const reserved = 'CON.mp4';
    const sanitized = sanitizeFilename(reserved);
    expect(sanitized).not.toBe('CON.mp4');

    const injection = 'video;rm -rf /;test.mp4';
    const cleanInjection = sanitizeFilename(injection);
    expect(cleanInjection).toBeDefined();
  });

  it('should reject invalid and dangerous URL schemes in DownloadManager', () => {
    const fileUrl = 'file:///C:/Windows/System32/drivers/etc/hosts';
    const resFile = DownloadManager.validateUrl(fileUrl);
    expect(resFile.valid).toBe(false);

    const jsUrl = 'javascript:alert(1)';
    const resJs = DownloadManager.validateUrl(jsUrl);
    expect(resJs.valid).toBe(false);

    const validHttp = 'https://example.com/video.mp4';
    const resValid = DownloadManager.validateUrl(validHttp);
    expect(resValid.valid).toBe(true);
  });

  it('should safely resolve export collision without path traversal', () => {
    const target = path.join('C:', 'exports', 'video.mp4');
    const { finalPath } = ExportManager.resolveCollision(target, 'rename');
    expect(finalPath).toContain('video');
    expect(finalPath.startsWith(path.join('C:', 'exports'))).toBe(true);
  });
});
