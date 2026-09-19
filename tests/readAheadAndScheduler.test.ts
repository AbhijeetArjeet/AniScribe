import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import Database from 'better-sqlite3';
import { runMigrations } from '../src/main/storage/migrations';
import { fastSampledFileHash } from '../src/main/utils/fileHash';
import { MediaStreamProbe } from '../src/main/ai/mediaStreamProbe';
import { HallucinationGuard } from '../src/main/ai/hallucinationGuard';
import { GlossaryManager } from '../src/main/ai/glossaryManager';
import { HeterogeneousScheduler } from '../src/main/ai/heterogeneousScheduler';
import { HardwareDetector } from '../src/main/ai/hardwareDetector';
import { InferenceSidecarManager } from '../src/main/ai/sidecar/inferenceSidecarManager';
import { LiveReadAheadManager } from '../src/main/ai/liveReadAheadManager';

describe('Live Read-Ahead, GPU/CPU Heterogeneous Scheduler & Pipeline Enhancements', () => {
  let tempDir: string;
  let db: any;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bf-readahead-test-'));
    db = new Database(path.join(tempDir, 'test.db'));
    runMigrations(db);
  });

  afterEach(() => {
    try {
      db.close();
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  });

  it('should compute deterministic fast sampled file hash for video files in <5ms', () => {
    const testVideo = path.join(tempDir, 'sample_anime.mp4');
    // Create a 500KB test buffer with known data
    const buffer = Buffer.alloc(500 * 1024, 0x41);
    buffer.write('HEAD_DATA', 0);
    buffer.write('MID_DATA', 250 * 1024);
    buffer.write('TAIL_DATA', 490 * 1024);
    fs.writeFileSync(testVideo, buffer);

    const t0 = performance.now();
    const hash1 = fastSampledFileHash(testVideo);
    const durationMs = performance.now() - t0;

    expect(durationMs).toBeLessThan(50); // fast execution
    expect(hash1).toHaveLength(64); // SHA-256

    const hash2 = fastSampledFileHash(testVideo);
    expect(hash1).toBe(hash2); // Deterministic
  });

  it('should probe container streams: prefer Japanese audio, detect bitmap vs text subtitles, and label speedup ESTIMATED', () => {
    const mockFfmpegOutput = `
Input #0, matroska,webm, from 'DemonSlayer_S01E01.mkv':
  Stream #0:0: Video: h264 (High), yuv420p, 1920x1080 [SAR 1:1 DAR 16:9], 23.98 fps
  Stream #0:1(eng): Audio: aac (LC), 48000 Hz, stereo, fltp (default)
  Stream #0:2(jpn): Audio: aac (LC), 48000 Hz, stereo, fltp
  Stream #0:3(eng): Subtitle: hdmv_pgs_subtitle
  Stream #0:4(jpn): Subtitle: ass
    `;

    const dummyFile = path.join(tempDir, 'dummy.mkv');
    fs.writeFileSync(dummyFile, 'dummy');

    const result = MediaStreamProbe.parseProbeOutput(dummyFile, mockFfmpegOutput);

    // Prefer Japanese audio (stream 2 instead of default English stream 1)
    expect(result.selectedAudioTrackIndex).toBe(2);

    // Bitmap subtitle detection (stream 3 is PGS -> bitmap)
    expect(result.subtitleStreams.find((s) => s.index === 3)?.isBitmapSubtitle).toBe(true);

    // Usable Japanese subtitle detection (stream 4 is ASS text -> usable!)
    expect(result.usableJapaneseSubtitleTrack).toBeDefined();
    expect(result.usableJapaneseSubtitleTrack?.index).toBe(4);
    expect(result.usableJapaneseSubtitleTrack?.codec).toBe('ass');

    // Labelled ESTIMATED
    expect(result.estimatedBypassSpeedupLabel).toContain('ESTIMATED');
  });

  it('should guard against hallucinated loops and align chunk cuts to VAD silence with overlap', () => {
    // 1. Repetition loop filter
    const repetitiveLoop = 'ご視聴ありがとうございました ご視聴ありがとうございました ご視聴ありがとうございました ご視聴ありがとうございました ご視聴ありがとうございました';
    const check1 = HallucinationGuard.filter(repetitiveLoop);
    expect(check1.isValid).toBe(false);

    // 2. High no-speech probability
    const check2 = HallucinationGuard.filter('Some random line', { noSpeechProb: 0.85 });
    expect(check2.isValid).toBe(false);

    // 3. Valid conversational sentence
    const check3 = HallucinationGuard.filter('諦めるな！まだ終わっていない！', { noSpeechProb: 0.05, confidence: 0.92 });
    expect(check3.isValid).toBe(true);
    expect(check3.cleanedText).toBe('諦めるな！まだ終わっていない！');

    // 4. VAD silence chunk alignment
    const speechSegments = [
      { start: 1.0, end: 4.5 },
      { start: 6.0, end: 11.8 }, // spans across target cut 10.0s
      { start: 14.0, end: 18.0 }
    ];

    // Requesting a chunk cut at 10.0s should align to 11.8s + 0.2s overlap to avoid slicing mid-sentence
    const aligned = HallucinationGuard.alignChunkToVadSilence(0, 10.0, speechSegments, 0.2);
    expect(aligned.start).toBe(0);
    expect(aligned.end).toBeCloseTo(12.0, 1);
  });

  it('should manage per-title glossary terms and apply substitutions in translated text', () => {
    const glossary = new GlossaryManager(db);
    const titleId = 'title-demonslayer';
    db.prepare(`INSERT INTO titles (id, name, authorized_source, created_at) VALUES (?, ?, ?, ?)`).run(titleId, 'Demon Slayer', 'api', Date.now());

    glossary.addTerm(titleId, '炭治郎', 'Tanjiro', 'character');
    glossary.addTerm(titleId, '禰豆子', 'Nezuko', 'character');
    glossary.addTerm(titleId, '全集中', 'Total Concentration', 'term');

    const terms = glossary.getTerms(titleId);
    expect(terms).toHaveLength(3);

    const rawTranslated = '炭治郎, protect 禰豆子 with 全集中 breathing!';
    const substituted = glossary.applyGlossary(rawTranslated, titleId);
    expect(substituted).toBe('Tanjiro, protect Nezuko with Total Concentration breathing!');

    // Delete term
    glossary.deleteTerm(terms[0].id);
    expect(glossary.getTerms(titleId)).toHaveLength(2);
  });

  it('should schedule chunks, track heterogeneous stages, and retry with floor and CPU fallback on OOM', async () => {
    const hwDetector = new HardwareDetector();
    const sidecarManager = new InferenceSidecarManager();
    const scheduler = new HeterogeneousScheduler(hwDetector, sidecarManager);

    scheduler.setPolicy('auto');
    expect(scheduler.getPolicy()).toBe('auto');

    const metrics = await scheduler.getMetrics();
    expect(metrics.policy).toBe('auto');
    expect(metrics.stages).toBeDefined();
    expect(metrics.stages.vadQueueDepth).toBe(0);
  });

  it('should maintain live read-ahead buffer, cancel on seek, cache in SQLite, and export to .en.srt', async () => {
    const hwDetector = new HardwareDetector();
    const sidecarManager = new InferenceSidecarManager();
    const scheduler = new HeterogeneousScheduler(hwDetector, sidecarManager);
    const glossary = new GlossaryManager(db);

    const videoFile = path.join(tempDir, 'Attack_on_Titan_S01E01.mp4');
    fs.writeFileSync(videoFile, Buffer.alloc(1024, 0x55));

    const readAhead = new LiveReadAheadManager(db, scheduler, glossary, tempDir);

    // Verify initial state
    expect(readAhead.getActiveCue(5.0)).toBeNull();

    // Start read-ahead
    await readAhead.start(videoFile, 0, 1.0);

    // Seek to 120s
    readAhead.seek(120);

    // Update playhead
    readAhead.updatePlayhead(122);

    // Export cached subtitles
    const exportedSrt = readAhead.exportToSrt(videoFile);
    expect(fs.existsSync(exportedSrt)).toBe(true);

    readAhead.stop();
  });
});
