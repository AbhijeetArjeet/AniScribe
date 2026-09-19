import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { ModelMetadata, QualityTier } from '../../shared/types/offlineEngine';

export class ModelRegistry {
  private modelsDir: string;
  private registryFile: string;
  private models: Map<string, ModelMetadata> = new Map();

  constructor(userDataPath: string) {
    this.modelsDir = path.join(userDataPath, 'models');
    this.registryFile = path.join(this.modelsDir, 'registry.json');
    this.ensureDirectory();
    this.initDefaultModels();
    this.loadInstalledStatus();
  }

  private ensureDirectory(): void {
    if (!fs.existsSync(this.modelsDir)) {
      fs.mkdirSync(this.modelsDir, { recursive: true });
    }
  }

  private initDefaultModels(): void {
    const defaults: ModelMetadata[] = [
      {
        id: 'kotoba-whisper-v2.0',
        name: 'Kotoba-Whisper v2.0 (Japanese SOTA)',
        type: 'asr',
        languages: ['ja'],
        inputLanguage: 'ja',
        outputLanguage: 'ja',
        sizeMB: 540,
        requiredRamMB: 1500,
        requiredVramMB: 800,
        cpuSupported: true,
        cudaSupported: true,
        defaultQuantization: 'int8',
        license: 'Apache-2.0',
        recommendedTier: 'balanced',
        installed: false,
        downloadUrl: 'https://huggingface.co/kotoba-tech/kotoba-whisper-v2.0',
        description: 'State-of-the-art Japanese Whisper fine-tuned for accurate conversational Japanese & punctuation.',
      },
      {
        id: 'reazonspeech-k2-v2',
        name: 'ReazonSpeech k2-v2 (19,000h Japanese)',
        type: 'asr',
        languages: ['ja'],
        inputLanguage: 'ja',
        outputLanguage: 'ja',
        sizeMB: 650,
        requiredRamMB: 1800,
        requiredVramMB: 950,
        cpuSupported: true,
        cudaSupported: true,
        defaultQuantization: 'int8',
        license: 'Apache-2.0',
        recommendedTier: 'quality',
        installed: false,
        downloadUrl: 'https://huggingface.co/reazon-research/reazonspeech-k2-v2',
        description: 'Trained on 19,000+ hours of Japanese broadcast speech; exceptional at dramatic inflections.',
      },
      {
        id: 'faster-whisper-small-ja',
        name: 'Faster-Whisper Small (CTranslate2 INT8)',
        type: 'asr',
        languages: ['ja', 'en'],
        inputLanguage: 'ja',
        outputLanguage: 'en',
        sizeMB: 480,
        requiredRamMB: 1200,
        requiredVramMB: 650,
        cpuSupported: true,
        cudaSupported: true,
        defaultQuantization: 'int8',
        license: 'MIT',
        recommendedTier: 'balanced',
        installed: false,
        downloadUrl: 'https://huggingface.co/Systran/faster-whisper-small',
        description: 'Balanced profile for RTX 2050 (4GB VRAM). High accuracy Japanese speech to English translation.',
      },
      {
        id: 'whisper-tiny-ja',
        name: 'Whisper Tiny (Ultra-Light CPU)',
        type: 'asr',
        languages: ['ja', 'en'],
        inputLanguage: 'ja',
        outputLanguage: 'en',
        sizeMB: 75,
        requiredRamMB: 400,
        requiredVramMB: 200,
        cpuSupported: true,
        cudaSupported: true,
        defaultQuantization: 'int8',
        license: 'MIT',
        recommendedTier: 'ultra_light',
        installed: false,
        downloadUrl: 'https://huggingface.co/Systran/faster-whisper-tiny',
        description: 'Ultra-lightweight model running with minimal CPU/battery impact on low-end laptops.',
      },
      {
        id: 'sugoi-anime-translator-ja-en',
        name: 'Sugoi Anime Translator (Offline JA→EN)',
        type: 'translation',
        languages: ['ja', 'en'],
        inputLanguage: 'ja',
        outputLanguage: 'en',
        sizeMB: 380,
        requiredRamMB: 900,
        requiredVramMB: 500,
        cpuSupported: true,
        cudaSupported: true,
        defaultQuantization: 'int8',
        license: 'Apache-2.0',
        recommendedTier: 'balanced',
        installed: false,
        downloadUrl: 'https://huggingface.co/sugoi-toolkit/sugoi-translator',
        description: 'Specialized offline sentence translator tuned on anime dialog, slang, and honorific preservation.',
      },
      {
        id: 'silero-vad-v5',
        name: 'Silero VAD v5 (Neural Voice Activity Detector)',
        type: 'vad',
        languages: ['multilingual'],
        inputLanguage: 'audio',
        outputLanguage: 'vad',
        sizeMB: 2,
        requiredRamMB: 50,
        requiredVramMB: 10,
        cpuSupported: true,
        cudaSupported: true,
        defaultQuantization: 'none',
        license: 'MIT',
        recommendedTier: 'ultra_light',
        installed: false,
        downloadUrl: 'https://github.com/snakers4/silero-vad',
        description: 'High-precision pre-trained neural VAD that segments speech and rejects background music/silence.',
      },
    ];

    for (const m of defaults) {
      this.models.set(m.id, m);
    }
  }

  private loadInstalledStatus(): void {
    for (const [id, model] of this.models.entries()) {
      const modelPath = path.join(this.modelsDir, id);
      if (fs.existsSync(modelPath)) {
        model.installed = true;
        model.localPath = modelPath;
      }
    }
  }

  public getAllModels(): ModelMetadata[] {
    return Array.from(this.models.values());
  }

  public getModel(id: string): ModelMetadata | null {
    return this.models.get(id) || null;
  }

  public getModelsByTier(tier: QualityTier): ModelMetadata[] {
    return this.getAllModels().filter((m) => m.recommendedTier === tier);
  }

  public getModelsByType(type: 'asr' | 'translation' | 'vad'): ModelMetadata[] {
    return this.getAllModels().filter((m) => m.type === type);
  }

  public async installMockModel(id: string): Promise<boolean> {
    const model = this.models.get(id);
    if (!model) return false;

    const modelDir = path.join(this.modelsDir, id);
    if (!fs.existsSync(modelDir)) {
      fs.mkdirSync(modelDir, { recursive: true });
    }

    // Write metadata and mock weight descriptor
    fs.writeFileSync(path.join(modelDir, 'config.json'), JSON.stringify(model, null, 2), 'utf8');
    fs.writeFileSync(path.join(modelDir, 'weights.bin'), Buffer.alloc(1024), 'binary');

    const hash = crypto.createHash('sha256').update(fs.readFileSync(path.join(modelDir, 'config.json'))).digest('hex');
    model.checksum = hash;
    model.installed = true;
    model.localPath = modelDir;

    return true;
  }

  public deleteModel(id: string): boolean {
    const model = this.models.get(id);
    if (!model || !model.localPath) return false;

    try {
      if (fs.existsSync(model.localPath)) {
        fs.rmSync(model.localPath, { recursive: true, force: true });
      }
      model.installed = false;
      model.localPath = undefined;
      model.checksum = undefined;
      return true;
    } catch (e) {
      console.error(`[ModelRegistry] Failed to delete model ${id}:`, e);
      return false;
    }
  }

  public verifyModel(id: string): { verified: boolean; checksum?: string; error?: string } {
    const model = this.models.get(id);
    if (!model || !model.installed || !model.localPath) {
      return { verified: false, error: 'Model is not installed.' };
    }

    const configFile = path.join(model.localPath, 'config.json');
    if (!fs.existsSync(configFile)) {
      return { verified: false, error: 'Model files corrupted or missing config.json.' };
    }

    const checksum = crypto.createHash('sha256').update(fs.readFileSync(configFile)).digest('hex');
    return { verified: true, checksum };
  }
}
