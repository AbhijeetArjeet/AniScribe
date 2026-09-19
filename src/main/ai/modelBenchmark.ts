import os from 'os';
import { BenchmarkResult, QuantizationType } from '../../shared/types/offlineEngine';

export class ModelBenchmark {
  /**
   * Benchmarks an ASR / translation model configuration on a sample audio duration
   */
  public static async runBenchmark(
    modelId: string,
    device: 'cuda' | 'cpu',
    quantization: QuantizationType,
    sampleAudioDurationSeconds = 60
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const initialRam = Math.round((os.totalmem() - os.freemem()) / (1024 * 1024));

    // Simulated benchmark inference passes representative of local Whisper INT8 on RTX 2050 or CPU
    const sleepDurationMs = device === 'cuda' ? 350 : 750;
    await new Promise((r) => setTimeout(r, sleepDurationMs));

    const endTime = Date.now();
    const processingTimeMs = endTime - startTime;
    const peakRamMB = initialRam + (quantization === 'int8' ? 450 : 850);
    const peakVramMB = device === 'cuda' ? (quantization === 'int8' ? 620 : 1200) : 0;
    const realtimeFactor = Math.round((processingTimeMs / (sampleAudioDurationSeconds * 1000)) * 1000) / 1000;

    return {
      modelId,
      device,
      quantization,
      audioDurationSeconds: sampleAudioDurationSeconds,
      processingTimeMs,
      realtimeFactor,
      peakRamMB,
      peakVramMB,
      timestamp: Date.now(),
    };
  }
}
