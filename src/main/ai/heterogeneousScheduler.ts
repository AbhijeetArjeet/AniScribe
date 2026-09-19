import { HardwareDetector } from './hardwareDetector';
import { InferenceSidecarManager } from './sidecar/inferenceSidecarManager';

export type SchedulerPolicy = 'auto' | 'prefer_gpu' | 'prefer_cpu' | 'power_saver' | 'max_speed';

export interface StageMetrics {
  vadQueueDepth: number;
  asrQueueDepth: number;
  translationQueueDepth: number;
  vadAvgDurationMs: number;
  asrAvgDurationMs: number;
  translationAvgDurationMs: number;
}

export interface SchedulerMetrics {
  policy: SchedulerPolicy;
  gpuUtilization: number;
  vramUsedMb: number;
  vramTotalMb: number;
  gpuTempC: number;
  isOnBattery: boolean;
  isThrottled: boolean;
  stages: StageMetrics;
}

export interface ScheduledChunkTask {
  id: string;
  priority: number; // 100 = Live Playhead, 10 = Batch Season
  audioPath: string;
  startSec: number;
  endSec: number;
  onVadComplete?: (speechSegments: any[]) => void;
  onAsrComplete?: (result: { text: string; deviceUsed: string }) => void;
  onTranslationComplete?: (result: { translatedText: string; deviceUsed: string }) => void;
}

export class HeterogeneousScheduler {
  private policy: SchedulerPolicy = 'auto';
  private hardwareDetector: HardwareDetector;
  private sidecarManager: InferenceSidecarManager;

  // Queue tracking
  private activeLiveJobs = 0;
  private vadQueue: ScheduledChunkTask[] = [];
  private asrQueue: ScheduledChunkTask[] = [];
  private translationQueue: ScheduledChunkTask[] = [];

  // Stage timing metrics
  private vadTimings: number[] = [];
  private asrTimings: number[] = [];
  private transTimings: number[] = [];

  // VRAM & thermal cache
  private cachedGpuTemp = 40;
  private cachedIsOnBattery = false;
  private lastWatchdogProbe = 0;

  constructor(hardwareDetector: HardwareDetector, sidecarManager: InferenceSidecarManager) {
    this.hardwareDetector = hardwareDetector;
    this.sidecarManager = sidecarManager;
  }

  public setPolicy(policy: SchedulerPolicy): void {
    this.policy = policy;
  }

  public getPolicy(): SchedulerPolicy {
    return this.policy;
  }

  /**
   * Dispatches a chunk through pipelined heterogeneous stages
   */
  public async scheduleChunk(task: ScheduledChunkTask): Promise<{
    text: string;
    translatedText: string;
    asrDevice: string;
    transDevice: string;
    speechSegments: Array<{ start: number; end: number }>;
  }> {
    if (task.priority >= 100) {
      this.activeLiveJobs++;
    }

    try {
      // 1. Stage 1: VAD (CPU)
      this.vadQueue.push(task);
      const t0 = Date.now();
      const vadRes = await this.sidecarManager.executeWithOomRetry<{
        speech_segments: Array<{ start: number; end: number }>;
        audio_duration: number;
      }>({
        action: 'vad',
        audio_path: task.audioPath,
        device: 'cpu', // VAD always on CPU to preserve GPU memory
      });
      this.recordTiming(this.vadTimings, Date.now() - t0);
      this.removeFromQueue(this.vadQueue, task.id);
      if (task.onVadComplete) task.onVadComplete(vadRes.speech_segments);

      // Check preemption: if this is a batch job and live jobs are active, wait briefly
      if (task.priority < 100 && this.activeLiveJobs > 0) {
        await this.pauseForPreemption();
      }

      // 2. Stage 2: ASR (GPU preferred, CPU fallback)
      this.asrQueue.push(task);
      const asrDevice = await this.selectAsrDevice();
      const t1 = Date.now();
      const asrRes = await this.sidecarManager.executeWithOomRetry<{
        text: string;
        device_used: string;
      }>({
        action: 'asr',
        audio_path: task.audioPath,
        start_sec: task.startSec,
        end_sec: task.endSec,
        device: asrDevice,
      });
      this.recordTiming(this.asrTimings, Date.now() - t1);
      this.removeFromQueue(this.asrQueue, task.id);
      if (task.onAsrComplete) task.onAsrComplete({ text: asrRes.text, deviceUsed: asrRes.device_used });

      // 3. Stage 3: Translation (Dynamic CPU/GPU placement by free VRAM)
      this.translationQueue.push(task);
      const transDevice = await this.selectTranslationDevice();
      const t2 = Date.now();
      const transRes = await this.sidecarManager.executeWithOomRetry<{
        translated_text: string;
        device_used: string;
      }>({
        action: 'translate',
        audio_path: task.audioPath,
        japanese_text: asrRes.text,
        device: transDevice,
      });
      this.recordTiming(this.transTimings, Date.now() - t2);
      this.removeFromQueue(this.translationQueue, task.id);
      if (task.onTranslationComplete) task.onTranslationComplete({ translatedText: transRes.translated_text, deviceUsed: transRes.device_used });

      return {
        text: asrRes.text,
        translatedText: transRes.translated_text,
        asrDevice: asrRes.device_used,
        transDevice: transRes.device_used,
        speechSegments: vadRes.speech_segments,
      };
    } finally {
      if (task.priority >= 100) {
        this.activeLiveJobs = Math.max(0, this.activeLiveJobs - 1);
      }
    }
  }

  private async selectAsrDevice(): Promise<'cuda' | 'cpu'> {
    if (this.policy === 'prefer_cpu' || this.cachedIsOnBattery) {
      return 'cpu';
    }
    const hw = await this.hardwareDetector.getHardwareInfo();
    return hw.cudaAvailable ? 'cuda' : 'cpu';
  }

  private async selectTranslationDevice(): Promise<'cuda' | 'cpu'> {
    if (this.policy === 'prefer_cpu' || this.policy === 'power_saver' || this.cachedIsOnBattery) {
      return 'cpu';
    }
    const hw = await this.hardwareDetector.getHardwareInfo();
    // Only place translation on GPU if at least 1.2 GB VRAM is free
    if (hw.cudaAvailable && hw.vramAvailableMB >= 1200) {
      return 'cuda';
    }
    return 'cpu';
  }

  private async pauseForPreemption(): Promise<void> {
    while (this.activeLiveJobs > 0) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  private removeFromQueue(queue: ScheduledChunkTask[], id: string): void {
    const idx = queue.findIndex((t) => t.id === id);
    if (idx !== -1) queue.splice(idx, 1);
  }

  private recordTiming(list: number[], duration: number): void {
    list.push(duration);
    if (list.length > 20) list.shift();
  }

  private calcAvg(list: number[]): number {
    if (list.length === 0) return 0;
    return Math.round(list.reduce((a, b) => a + b, 0) / list.length);
  }

  public async getMetrics(): Promise<SchedulerMetrics> {
    const hw = await this.hardwareDetector.getHardwareInfo();
    return {
      policy: this.policy,
      gpuUtilization: hw.cudaAvailable ? 25 : 0,
      vramUsedMb: Math.max(0, hw.vramTotalMB - hw.vramAvailableMB),
      vramTotalMb: hw.vramTotalMB,
      gpuTempC: this.cachedGpuTemp,
      isOnBattery: this.cachedIsOnBattery,
      isThrottled: this.cachedGpuTemp > 80,
      stages: {
        vadQueueDepth: this.vadQueue.length,
        asrQueueDepth: this.asrQueue.length,
        translationQueueDepth: this.translationQueue.length,
        vadAvgDurationMs: this.calcAvg(this.vadTimings),
        asrAvgDurationMs: this.calcAvg(this.asrTimings),
        translationAvgDurationMs: this.calcAvg(this.transTimings),
      },
    };
  }
}
