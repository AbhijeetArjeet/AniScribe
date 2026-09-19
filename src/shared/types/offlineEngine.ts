/**
 * Production-Grade Offline Subtitle Engine Types & Contracts
 */

export type ModelType = 'asr' | 'translation' | 'vad';
export type QuantizationType = 'none' | 'int8' | 'int4' | 'fp16' | 'fp32';
export type QualityTier = 'ultra_light' | 'balanced' | 'quality';

export interface HardwareInfo {
  cpuModel: string;
  cpuCores: number;
  totalRamMB: number;
  availableRamMB: number;
  gpuName: string;
  vramTotalMB: number;
  vramAvailableMB: number;
  cudaAvailable: boolean;
  cudaVersion?: string;
  recommendedTier: QualityTier;
  recommendedDevice: 'cuda' | 'cpu';
  recommendedQuantization: QuantizationType;
}

export interface ModelMetadata {
  id: string;
  name: string;
  type: ModelType;
  languages: string[];
  inputLanguage: string;
  outputLanguage: string;
  sizeMB: number;
  requiredRamMB: number;
  requiredVramMB: number;
  cpuSupported: boolean;
  cudaSupported: boolean;
  defaultQuantization: QuantizationType;
  license: string;
  recommendedTier: QualityTier;
  installed: boolean;
  downloadUrl?: string;
  localPath?: string;
  checksum?: string;
  description: string;
}

export interface TranscriptSegment {
  id: number;
  start: number; // seconds
  end: number;   // seconds
  text: string;
  confidence?: number;
  speakerId?: string;
  words?: Array<{ word: string; start: number; end: number; probability?: number }>;
}

export interface Transcript {
  audioPath: string;
  durationSeconds: number;
  language: string;
  segments: TranscriptSegment[];
  rawText: string;
}

export interface TranslatedSegment {
  id: number;
  originalStart: number;
  originalEnd: number;
  adjustedStart: number;
  adjustedEnd: number;
  sourceText: string;
  translatedText: string;
  confidence?: number;
}

export interface TranslatedTranscript {
  sourceLanguage: string;
  targetLanguage: string;
  segments: TranslatedSegment[];
}

export interface SubtitleCue {
  id: number;
  start: number; // seconds
  end: number;   // seconds
  text: string;
  originalText?: string;
}

export interface QualityWarning {
  type: 'empty' | 'overlap' | 'excessive_cps' | 'excessive_duration' | 'too_short' | 'duplicate' | 'untranslated' | 'syntax';
  message: string;
  cueId?: number;
  timestamp?: number;
}

export interface QualityReport {
  isValid: boolean;
  totalCues: number;
  warnings: QualityWarning[];
  averageCharactersPerSecond: number;
  maxCharactersPerSecond: number;
  untranslatedRatio: number;
  score: number; // 0 to 100
}

export interface SubtitleResult {
  success: boolean;
  srtPath?: string;
  vttPath?: string;
  japaneseSrtPath?: string;
  totalCues: number;
  audioDurationSeconds: number;
  processingTimeMs: number;
  realtimeFactor: number;
  qualityReport: QualityReport;
  error?: string;
}

export interface TranscriptionOptions {
  language?: string;
  modelId?: string;
  device?: 'cuda' | 'cpu';
  quantization?: QuantizationType;
  vadPaddingLeadMs?: number;
  vadPaddingTailMs?: number;
}

export interface TranslationOptions {
  sourceLanguage?: string;
  targetLanguage?: string;
  modelId?: string;
  preserveHonorifics?: boolean;
}

export interface SubtitleOptions extends TranscriptionOptions, TranslationOptions {
  maxCharactersPerLine?: number;
  maxLinesPerCue?: number;
  minDurationSeconds?: number;
  maxDurationSeconds?: number;
  targetCps?: number;
  outputJapaneseSrt?: boolean;
}

export interface EngineCapabilities {
  supportedAsrModels: string[];
  supportedTranslationModels: string[];
  hardwareAcceleration: 'cuda' | 'cpu';
  supportedInputFormats: string[];
  offlineGuaranteed: boolean;
}

export interface BenchmarkResult {
  modelId: string;
  device: 'cuda' | 'cpu';
  quantization: QuantizationType;
  audioDurationSeconds: number;
  processingTimeMs: number;
  realtimeFactor: number;
  peakRamMB: number;
  peakVramMB: number;
  timestamp: number;
}

export interface OfflineSubtitleEngine {
  getCapabilities(): EngineCapabilities;
  transcribe(audioPath: string, options?: TranscriptionOptions): Promise<Transcript>;
  translate(transcript: Transcript, options?: TranslationOptions): Promise<TranslatedTranscript>;
  generateSubtitles(videoPath: string, options?: SubtitleOptions): Promise<SubtitleResult>;
}
