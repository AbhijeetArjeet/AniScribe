export type AiProvider = 'local_whisper' | 'ollama' | 'gemini' | 'groq' | 'openai' | 'offline_engine';

export type AiHardwareProfile = 'ultra_light' | 'balanced_rtx2050' | 'high_quality' | 'cloud_free';

export interface AiSubtitleConfig {
  provider: AiProvider;
  profile: AiHardwareProfile;
  apiKey?: string;
  model: string;
  endpointUrl: string; // e.g. 'http://localhost:11434/v1' or 'http://localhost:8080/v1'
  sourceLanguage: string; // 'ja' (Japanese)
  targetLanguage: string; // 'en' (English)
  task: 'translate' | 'transcribe';
  vadSensitivity: number; // 0.01 to 0.1 threshold
  batchConcurrency: number; // 1-2 for low VRAM
}

export interface LiveTranslationResult {
  text: string;
  originalText?: string;
  timestamp: number;
  confidence?: number;
}

export interface AiSubtitleProgress {
  episodeId: string;
  status: 'idle' | 'extracting' | 'transcribing' | 'translating' | 'saving' | 'completed' | 'error';
  percent: number;
  currentCue?: string;
  error?: string;
  srtPath?: string;
}

export interface BatchSubtitleJob {
  id: string;
  titleId: string;
  titleName: string;
  seasonNumber: number;
  episodeIds: string[];
  totalEpisodes: number;
  completedEpisodes: number;
  failedEpisodes: number;
  status: 'pending' | 'processing' | 'completed' | 'cancelled' | 'error';
  currentEpisodeId?: string;
}
