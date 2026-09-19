import fs from 'fs';
import path from 'path';
import { EventEmitter } from 'events';
import { spawn, ChildProcess } from 'child_process';
import { IDatabase } from '../storage/database';
import { fastSampledFileHash } from '../utils/fileHash';
import { MediaStreamProbe } from './mediaStreamProbe';
import { HallucinationGuard } from './hallucinationGuard';
import { HeterogeneousScheduler } from './heterogeneousScheduler';
import { SubtitleSegmenter } from './subtitleSegmenter';
import { GlossaryManager } from './glossaryManager';
import { SubtitleCue } from '../../shared/types/offlineEngine';

export interface LiveBufferStatus {
  isBuffering: boolean;
  playheadSec: number;
  bufferAheadSec: number;
  activeChunkIndex: number;
  totalCachedChunks: number;
}

export class LiveReadAheadManager extends EventEmitter {
  private currentVideoPath: string | null = null;
  private currentFileHash: string | null = null;
  private currentPlayhead = 0;
  private playbackSpeed = 1.0;
  private isPaused = false;
  private isRunning = false;

  private lookAheadTargetSec = 45; // 30-60s target
  private chunkDurationSec = 12.0;

  private inFlightAbortController: AbortController | null = null;
  private activeExtractProc: ChildProcess | null = null;

  private committedCues: SubtitleCue[] = [];
  private cachedChunkRanges: Array<{ start: number; end: number }> = [];

  private pipelineVersion = '2.0.0';
  private asrModelId = 'whisper-tiny-int8';
  private asrModelVersion = '1.0';
  private vadSettingsHash = 'silero_v4_lead200_tail300';
  private transModelId = 'whisper-tiny-int8-trans';
  private transModelVersion = '1.0';

  constructor(
    private db: IDatabase,
    private scheduler: HeterogeneousScheduler,
    private glossaryManager: GlossaryManager,
    private tempDir: string
  ) {
    super();
  }

  public async start(videoPath: string, startPosition: number = 0, speed: number = 1.0): Promise<void> {
    if (!fs.existsSync(videoPath)) {
      throw new Error(`Media file does not exist: ${videoPath}`);
    }

    this.stop();

    this.currentVideoPath = videoPath;
    this.currentPlayhead = startPosition;
    this.playbackSpeed = speed;
    this.isRunning = true;
    this.currentFileHash = fastSampledFileHash(videoPath);

    // Load any existing cached chunks from SQLite
    this.loadCachedChunksFromDb();

    // Start read-ahead buffering loop in background
    this.runBufferLoop();
  }

  public seek(newPosition: number): void {
    this.currentPlayhead = Math.max(0, newPosition);

    // Cancel in-flight chunk extraction for the old playhead position
    if (this.inFlightAbortController) {
      this.inFlightAbortController.abort();
      this.inFlightAbortController = null;
    }
    if (this.activeExtractProc) {
      this.activeExtractProc.kill('SIGTERM');
      this.activeExtractProc = null;
    }

    this.emitBufferStatus();
  }

  public setPlaybackSpeed(speed: number): void {
    this.playbackSpeed = Math.max(0.25, Math.min(3.0, speed));
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  public updatePlayhead(timeSec: number): void {
    this.currentPlayhead = Math.max(0, timeSec);
    this.emitBufferStatus();
  }

  public stop(): void {
    this.isRunning = false;
    if (this.inFlightAbortController) {
      this.inFlightAbortController.abort();
      this.inFlightAbortController = null;
    }
    if (this.activeExtractProc) {
      this.activeExtractProc.kill('SIGTERM');
      this.activeExtractProc = null;
    }
  }

  /**
   * Returns active cue for the given timestamp without ever mutating on-screen committed text
   */
  public getActiveCue(timeSec: number): SubtitleCue | null {
    const cue = this.committedCues.find((c) => timeSec >= c.start && timeSec <= c.end);
    return cue || null;
  }

  public getAllCommittedCues(): SubtitleCue[] {
    return [...this.committedCues].sort((a, b) => a.start - b.start);
  }

  private loadCachedChunksFromDb(): void {
    if (!this.currentFileHash) return;

    const rows = this.db.prepare(`
      SELECT cues_json, start_sec, end_sec
      FROM ai_translation_chunks t
      JOIN ai_asr_chunks a ON t.asr_chunk_id = a.id
      WHERE t.file_hash = ?
      ORDER BY a.start_sec ASC
    `).all(this.currentFileHash) as Array<{ cues_json: string; start_sec: number; end_sec: number }>;

    for (const r of rows) {
      try {
        const cues = JSON.parse(r.cues_json) as SubtitleCue[];
        for (const c of cues) {
          if (!this.committedCues.some((existing) => existing.id === c.id && existing.start === c.start)) {
            this.committedCues.push(c);
          }
        }
        this.cachedChunkRanges.push({ start: r.start_sec, end: r.end_sec });
      } catch {
        // Ignore corrupted json
      }
    }
  }

  private async runBufferLoop(): Promise<void> {
    while (this.isRunning) {
      if (this.isPaused) {
        await new Promise((r) => setTimeout(r, 400));
        continue;
      }

      const nextUnbufferedStart = this.findNextUnbufferedStart(this.currentPlayhead);
      const bufferAhead = nextUnbufferedStart - this.currentPlayhead;

      // If buffer has reached target 45s ahead of playhead, sleep briefly
      if (bufferAhead >= this.lookAheadTargetSec) {
        await new Promise((r) => setTimeout(r, 600));
        continue;
      }

      const chunkStart = nextUnbufferedStart;
      const chunkEnd = chunkStart + this.chunkDurationSec;

      try {
        await this.processChunk(chunkStart, chunkEnd);
      } catch (err: any) {
        if (err.name === 'AbortError') {
          // Normal seek cancellation
          continue;
        }
        console.warn('[LiveReadAhead] Chunk processing error:', err.message);
        await new Promise((r) => setTimeout(r, 800));
      }
    }
  }

  private findNextUnbufferedStart(fromTime: number): number {
    let t = fromTime;
    for (const range of this.cachedChunkRanges) {
      if (t >= range.start && t < range.end) {
        t = range.end;
      }
    }
    return t;
  }

  private async processChunk(startSec: number, endSec: number): Promise<void> {
    if (!this.currentVideoPath || !this.currentFileHash) return;

    this.inFlightAbortController = new AbortController();

    // 1. Extract audio slice using ffmpeg
    const audioChunkPath = path.join(this.tempDir, `live_chunk_${startSec}_${endSec}.wav`);
    await this.extractAudioSlice(this.currentVideoPath, startSec, endSec, audioChunkPath);

    // 2. Schedule through Heterogeneous GPU/CPU Scheduler with Priority 100 (Live)
    const result = await this.scheduler.scheduleChunk({
      id: `live-${startSec}-${endSec}`,
      priority: 100, // Live preemption
      audioPath: audioChunkPath,
      startSec,
      endSec,
    });

    // 3. Hallucination Guard
    const guard = HallucinationGuard.filter(result.text);
    const cleanedJapanese = guard.isValid ? guard.cleanedText : '';

    // 4. Format into Subtitle Cues
    const cues = SubtitleSegmenter.segmentAndFormat([
      { start: startSec, end: endSec, text: cleanedJapanese }
    ]);

    // Apply Glossary
    for (const cue of cues) {
      cue.text = this.glossaryManager.applyGlossary(cue.text, this.currentVideoPath);
    }

    // 5. Commit cues
    for (const cue of cues) {
      if (!this.committedCues.some((c) => c.start === cue.start && c.text === cue.text)) {
        this.committedCues.push(cue);
      }
    }
    this.cachedChunkRanges.push({ start: startSec, end: endSec });

    // 6. Persist ASR and Translation separately in SQLite
    const asrChunkId = `asr-${this.currentFileHash}-${startSec}-${endSec}`;
    const now = Date.now();

    this.db.prepare(`
      INSERT OR REPLACE INTO ai_asr_chunks 
      (id, file_hash, pipeline_version, model_id, model_version, vad_settings_hash, start_sec, end_sec, japanese_text, segments_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      asrChunkId,
      this.currentFileHash,
      this.pipelineVersion,
      this.asrModelId,
      this.asrModelVersion,
      this.vadSettingsHash,
      startSec,
      endSec,
      cleanedJapanese,
      JSON.stringify(result.speechSegments),
      now
    );

    this.db.prepare(`
      INSERT OR REPLACE INTO ai_translation_chunks
      (id, asr_chunk_id, file_hash, translation_model_id, translation_model_version, target_language, english_text, cues_json, is_committed, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      `trans-${asrChunkId}`,
      asrChunkId,
      this.currentFileHash,
      this.transModelId,
      this.transModelVersion,
      'en',
      result.translatedText,
      JSON.stringify(cues),
      1,
      now
    );

    // Clean up temporary wav
    try {
      if (fs.existsSync(audioChunkPath)) fs.unlinkSync(audioChunkPath);
    } catch {}

    this.emit('chunk:ready', cues);
    this.emitBufferStatus();
  }

  private extractAudioSlice(videoPath: string, startSec: number, endSec: number, outWavPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ffmpeg = MediaStreamProbe.getFfmpegPath();
      const duration = endSec - startSec;

      const proc = spawn(ffmpeg, [
        '-y',
        '-hide_banner',
        '-ss', startSec.toString(),
        '-i', videoPath,
        '-t', duration.toString(),
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        outWavPath
      ], { windowsHide: true });

      this.activeExtractProc = proc;

      proc.on('close', (code) => {
        this.activeExtractProc = null;
        if (code === 0 && fs.existsSync(outWavPath)) {
          resolve();
        } else {
          reject(new Error(`FFmpeg audio extract failed with exit code ${code}`));
        }
      });

      proc.on('error', (err) => {
        this.activeExtractProc = null;
        reject(err);
      });
    });
  }

  private emitBufferStatus(): void {
    const nextUnbuffered = this.findNextUnbufferedStart(this.currentPlayhead);
    const bufferAhead = Math.max(0, nextUnbuffered - this.currentPlayhead);
    const isBuffering = bufferAhead < 4.0;

    const status: LiveBufferStatus = {
      isBuffering,
      playheadSec: this.currentPlayhead,
      bufferAheadSec: Math.round(bufferAhead * 10) / 10,
      activeChunkIndex: Math.floor(this.currentPlayhead / this.chunkDurationSec),
      totalCachedChunks: this.cachedChunkRanges.length,
    };

    this.emit('buffer:status', status);
  }

  /**
   * Exports all accumulated live subtitle chunks to a standard .en.srt file
   */
  public exportToSrt(videoPath?: string): string {
    const targetVideo = videoPath || this.currentVideoPath;
    if (!targetVideo) {
      throw new Error('No active video file to export subtitles for');
    }

    const dir = path.dirname(targetVideo);
    const ext = path.extname(targetVideo);
    const base = path.basename(targetVideo, ext);
    const srtPath = path.join(dir, `${base}.en.srt`);

    const sortedCues = this.getAllCommittedCues();
    const srtContent = SubtitleSegmenter.cuesToSrt(sortedCues);

    fs.writeFileSync(srtPath, srtContent, 'utf8');
    return srtPath;
  }
}
