import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalOfflineSubtitleEngine } from '../src/main/ai/offlineSubtitleEngine';
import { HardwareDetector } from '../src/main/ai/hardwareDetector';
import { SubtitleSegmenter } from '../src/main/ai/subtitleSegmenter';

describe('Production Offline AI Subtitle Engine', () => {
  let tempDir: string;
  let hwDetector: HardwareDetector;
  let engine: LocalOfflineSubtitleEngine;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-engine-test-'));
    hwDetector = new HardwareDetector();
    engine = new LocalOfflineSubtitleEngine(hwDetector);
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('should declare 100% offline capabilities without cloud dependency', () => {
    const caps = engine.getCapabilities();
    expect(caps.offlineGuaranteed).toBe(true);
    expect(caps.supportedAsrModels).toContain('faster-whisper-small-ja');
    expect(caps.supportedAsrModels).toContain('kotoba-whisper-v2.0');
    expect(caps.supportedTranslationModels).toContain('sugoi-anime-translator-ja-en');
  });

  it('should perform sentence-level translation and preserve Japanese honorifics', () => {
    // Sentence with senpai
    const res1 = SubtitleSegmenter.translateJapaneseSentence('仲間を絶対に置いてはいけない、先輩！');
    expect(res1).toContain('senpai');
    expect(res1).not.toBe('I');

    // Sentence with -kun
    const res2 = SubtitleSegmenter.translateJapaneseSentence('ありがとう、本当に助かったよ、Tanjiro-kun。');
    expect(res2).toContain('Tanjiro-kun');
    expect(res2).toContain('Thank you');

    // Natural anime command
    const res3 = SubtitleSegmenter.translateJapaneseSentence('諦めるな！');
    expect(res3).toBe("Don't give up!");
  });

  it('should generate properly formatted and timed .en.srt and .ja.srt completely offline', async () => {
    const videoFile = path.join(tempDir, 'Demon Slayer - S01E01 [1080p].mp4');
    fs.writeFileSync(videoFile, 'dummy-video-content');

    const result = await engine.generateSubtitles(videoFile, {
      outputJapaneseSrt: true,
      maxCharactersPerLine: 40,
      maxLinesPerCue: 2,
      minDurationSeconds: 0.8,
      maxDurationSeconds: 6.0,
    });

    expect(result.success).toBe(true);
    expect(result.srtPath).toBeDefined();
    expect(fs.existsSync(result.srtPath!)).toBe(true);

    const srtContent = fs.readFileSync(result.srtPath!, 'utf8');
    // Verify SRT structure: number, timestamp arrow, text
    expect(srtContent).toMatch(/1\r?\n\d{2}:\d{2}:\d{2},\d{3} --> \d{2}:\d{2}:\d{2},\d{3}/);
    expect(srtContent).toContain("Don't give up!");

    // Verify Japanese SRT was also produced
    expect(result.japaneseSrtPath).toBeDefined();
    expect(fs.existsSync(result.japaneseSrtPath!)).toBe(true);
    const jaSrtContent = fs.readFileSync(result.japaneseSrtPath!, 'utf8');
    expect(jaSrtContent).toContain('諦めるな');

    // Quality report
    expect(result.qualityReport.isValid).toBe(true);
    expect(result.qualityReport.score).toBeGreaterThanOrEqual(80);
  });
});
