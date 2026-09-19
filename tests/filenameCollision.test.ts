import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { RangeDownloader } from '../src/main/downloader/RangeDownloader';

describe('Filename Collision, Templates & Disk Errors', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-collision-'));
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should handle filename collisions correctly: file.ext -> file (1).ext -> file (2).ext', () => {
    const filename = 'video.mp4';
    // 1. Initial should be file.ext
    expect(RangeDownloader.getSafeFilename(tempDir, filename)).toBe('video.mp4');

    // Create file.ext
    fs.writeFileSync(path.join(tempDir, filename), 'content');
    expect(RangeDownloader.getSafeFilename(tempDir, filename)).toBe('video (1).mp4');

    // Create file (1).ext
    fs.writeFileSync(path.join(tempDir, 'video (1).mp4'), 'content');
    expect(RangeDownloader.getSafeFilename(tempDir, filename)).toBe('video (2).mp4');

    // With overwrite = true, should return original filename
    expect(RangeDownloader.getSafeFilename(tempDir, filename, true)).toBe('video.mp4');
  });

  it('should format filename templates properly with {title}, {episode}, {quality}, {ext}', () => {
    const template = '{title} - {episode} [{quality}].{ext}';
    const formatted = RangeDownloader.applyFilenameTemplate(template, {
      title: 'Bleach',
      episode: 'E01',
      quality: '1080p',
      ext: 'mkv',
    });
    expect(formatted).toBe('Bleach - E01 [1080p].mkv');
  });

  it('should sanitize illegal characters from filename templates', () => {
    const template = '{title}:{episode}.{ext}';
    const formatted = RangeDownloader.applyFilenameTemplate(template, {
      title: 'Show/Title',
      episode: '01',
      ext: 'mp4',
    });
    expect(formatted).toBe('Show_Title_01.mp4');
  });

  it('should map disk errors into user-friendly descriptions', () => {
    expect(RangeDownloader.mapDiskError({ code: 'ENOSPC' })).toContain('Disk is full');
    expect(RangeDownloader.mapDiskError({ code: 'EACCES' })).toContain('Permission denied');
    expect(RangeDownloader.mapDiskError({ code: 'EPERM' })).toContain('Permission denied');
    expect(RangeDownloader.mapDiskError({ code: 'ENOENT' })).toContain('Destination folder does not exist');
  });
});
