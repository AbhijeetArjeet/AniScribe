import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

export interface StreamInfo {
  index: number;
  type: 'video' | 'audio' | 'subtitle';
  codec: string;
  language?: string;
  title?: string;
  isBitmapSubtitle?: boolean;
}

export interface ContainerProbeResult {
  filePath: string;
  audioStreams: StreamInfo[];
  subtitleStreams: StreamInfo[];
  selectedAudioTrackIndex: number;
  usableJapaneseSubtitleTrack?: StreamInfo;
  estimatedBypassSpeedupLabel?: string;
}

export class MediaStreamProbe {
  private static ffmpegPath: string = MediaStreamProbe.detectFfmpegPath();

  public static setFfmpegPath(customPath: string): void {
    if (fs.existsSync(customPath)) {
      this.ffmpegPath = customPath;
    }
  }

  public static getFfmpegPath(): string {
    return this.ffmpegPath;
  }

  private static detectFfmpegPath(): string {
    // 1. Check Python imageio-ffmpeg bundled binary
    const roaming = process.env.APPDATA || '';
    const pythonFfmpeg = path.join(roaming, 'Python', 'Python314', 'site-packages', 'imageio_ffmpeg', 'binaries', 'ffmpeg-win-x86_64-v7.1.exe');
    if (fs.existsSync(pythonFfmpeg)) {
      return pythonFfmpeg;
    }

    // 2. Check local tools/ or app root
    const localFfmpeg = path.join(process.cwd(), 'ffmpeg.exe');
    if (fs.existsSync(localFfmpeg)) {
      return localFfmpeg;
    }

    // Default to PATH
    return 'ffmpeg';
  }

  /**
   * Probes container streams using ffmpeg -i
   */
  public static async probeFile(filePath: string): Promise<ContainerProbeResult> {
    if (!fs.existsSync(filePath)) {
      throw new Error(`File does not exist: ${filePath}`);
    }

    const output = await new Promise<string>((resolve) => {
      const proc = spawn(this.ffmpegPath, ['-hide_banner', '-i', filePath], {
        windowsHide: true,
      });

      let stderrData = '';
      proc.stderr.on('data', (chunk) => {
        stderrData += chunk.toString();
      });

      proc.on('close', () => {
        resolve(stderrData);
      });

      proc.on('error', () => {
        resolve(stderrData);
      });
    });

    return this.parseProbeOutput(filePath, output);
  }

  public static parseProbeOutput(filePath: string, output: string): ContainerProbeResult {
    const audioStreams: StreamInfo[] = [];
    const subtitleStreams: StreamInfo[] = [];

    // Match lines like:
    // Stream #0:1(jpn): Audio: aac (LC), 48000 Hz, stereo, fltp
    // Stream #0:2(eng): Subtitle: subrip
    // Stream #0:3(jpn): Subtitle: ass
    // Stream #0:4(eng): Subtitle: hdmv_pgs_subtitle
    const streamRegex = /Stream\s+#0:(\d+)(?:\(([a-zA-Z0-9_-]+)\))?:\s+(Audio|Subtitle):\s+([a-zA-Z0-9_-]+)/gi;
    let match: RegExpExecArray | null;

    while ((match = streamRegex.exec(output)) !== null) {
      const index = parseInt(match[1], 10);
      const language = match[2] ? match[2].toLowerCase() : undefined;
      const typeStr = match[3].toLowerCase();
      const codec = match[4].toLowerCase();

      if (typeStr === 'audio') {
        audioStreams.push({
          index,
          type: 'audio',
          codec,
          language,
        });
      } else if (typeStr === 'subtitle') {
        const isBitmap = codec === 'hdmv_pgs_subtitle' || codec === 'pgs' || codec === 'dvd_subtitle' || codec === 'dvdsub' || codec === 'vobsub';
        subtitleStreams.push({
          index,
          type: 'subtitle',
          codec,
          language,
          isBitmapSubtitle: isBitmap,
        });
      }
    }

    // 1. Audio Track Selection: Prefer Japanese audio track
    let selectedAudioTrackIndex = audioStreams.length > 0 ? audioStreams[0].index : 0;
    const jaAudio = audioStreams.find((s) => s.language && (s.language === 'jpn' || s.language === 'ja' || s.language.includes('japan')));
    if (jaAudio) {
      selectedAudioTrackIndex = jaAudio.index;
    }

    // 2. Embedded Subtitle Track Selection:
    // Fall back to ASR if:
    // - Subtitle is bitmap (PGS/VobSub)
    // - Subtitle is English-only (not Japanese source text)
    // - No Japanese subtitle track found
    let usableJapaneseSubtitleTrack: StreamInfo | undefined;
    const jaSub = subtitleStreams.find((s) => s.language && (s.language === 'jpn' || s.language === 'ja' || s.language.includes('japan')));
    if (jaSub && !jaSub.isBitmapSubtitle) {
      usableJapaneseSubtitleTrack = jaSub;
    }

    return {
      filePath,
      audioStreams,
      subtitleStreams,
      selectedAudioTrackIndex,
      usableJapaneseSubtitleTrack,
      estimatedBypassSpeedupLabel: usableJapaneseSubtitleTrack ? '[ESTIMATED: ~70-85% processing time reduction by bypassing ASR]' : undefined,
    };
  }

  /**
   * Extracts text-based subtitle track directly to SRT format
   */
  public static async extractSubtitleStream(filePath: string, streamIndex: number, outSrtPath: string): Promise<boolean> {
    return new Promise((resolve) => {
      const proc = spawn(this.ffmpegPath, [
        '-y',
        '-hide_banner',
        '-i', filePath,
        '-map', `0:${streamIndex}`,
        '-c:s', 'srt',
        outSrtPath
      ], { windowsHide: true });

      proc.on('close', (code) => {
        resolve(code === 0 && fs.existsSync(outSrtPath));
      });

      proc.on('error', () => {
        resolve(false);
      });
    });
  }
}
