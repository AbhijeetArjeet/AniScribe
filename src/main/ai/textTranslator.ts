import { SubtitleCue } from '../../shared/types/offlineEngine';
import { GlossaryManager } from './glossaryManager';
import { InferenceSidecarManager } from './sidecar/inferenceSidecarManager';
import { SubtitleSegmenter } from './subtitleSegmenter';

export interface TranslationRequest {
  sourceLanguage: string; // 'ja' | 'ko' | 'zh'
  targetLanguage: string; // 'en'
  text: string;
  titleId?: string;
  device?: 'cuda' | 'cpu';
}

export interface TranslatedSubtitleResult {
  sourceText: string;
  translatedText: string;
  cues: SubtitleCue[];
  modelUsed: string;
  deviceUsed: string;
}

export class TextTranslator {
  constructor(
    private sidecarManager: InferenceSidecarManager,
    private glossaryManager: GlossaryManager
  ) {}

  /**
   * Translates ASR segments using a dedicated text-to-text translation model
   * with per-title glossary substitution and sentence boundary preservation.
   */
  public async translateSegments(
    segments: Array<{ start: number; end: number; text: string }>,
    sourceLang: string = 'ja',
    targetLang: string = 'en',
    titleId?: string,
    device: 'cuda' | 'cpu' = 'cpu'
  ): Promise<TranslatedSubtitleResult> {
    const rawSourceText = segments.map((s) => s.text).join(' ');
    if (!rawSourceText.trim()) {
      return {
        sourceText: '',
        translatedText: '',
        cues: [],
        modelUsed: 'none',
        deviceUsed: device,
      };
    }

    // 1. Group clauses into coherent, full sentences (not isolated single words)
    const combinedSentences: Array<{ start: number; end: number; text: string }> = [];
    let curText = '';
    let curStart = 0;
    let curEnd = 0;

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (!curText) {
        curStart = seg.start;
        curText = seg.text;
        curEnd = seg.end;
      } else {
        curText += ' ' + seg.text;
        curEnd = seg.end;
      }

      // Sentence terminating punctuation in CJK
      const isEnd = /[。！？!?…\n]$/.test(seg.text.trim()) || (curEnd - curStart) >= 5.0 || i === segments.length - 1;
      if (isEnd) {
        combinedSentences.push({ start: curStart, end: curEnd, text: curText.trim() });
        curText = '';
      }
    }

    // 2. Apply per-title pre-translation glossary overrides
    const preprocessedSentences = combinedSentences.map((s) => {
      let t = s.text;
      if (titleId) {
        t = this.glossaryManager.applyGlossary(t, titleId);
      }
      return { ...s, text: t };
    });

    // 3. Execute dedicated text-to-text translation stage via sidecar
    const translatedCues: SubtitleCue[] = [];
    let overallModel = `opus-mt-${sourceLang}-${targetLang}`;
    let overallDevice = device;

    for (let i = 0; i < preprocessedSentences.length; i++) {
      const sentence = preprocessedSentences[i];
      let translated = '';

      try {
        const sidecarRes = await this.sidecarManager.executeWithOomRetry<{
          translated_text: string;
          model_used?: string;
          device_used?: string;
        }>({
          action: 'text_translate',
          source_language: sourceLang,
          target_language: targetLang,
          text: sentence.text,
          device,
        });

        translated = sidecarRes.translated_text || '';
        if (sidecarRes.model_used) overallModel = sidecarRes.model_used;
        if (sidecarRes.device_used) overallDevice = sidecarRes.device_used as any;
      } catch (err) {
        // Fallback to sentence dictionary / heuristic if model not downloaded
        translated = SubtitleSegmenter.translateJapaneseSentence(sentence.text);
      }

      // 4. Post-translation glossary substitution (character names and honorifics)
      if (titleId) {
        translated = this.glossaryManager.applyGlossary(translated, titleId);
      }

      // Wrap into standard subtitle lines
      const cues = SubtitleSegmenter.segmentAndFormat(
        [{ start: sentence.start, end: sentence.end, text: translated }],
        { maxCharactersPerLine: 42, maxLinesPerCue: 2 }
      );

      for (const c of cues) {
        translatedCues.push({
          ...c,
          id: translatedCues.length + 1,
          originalText: sentence.text,
        });
      }
    }

    const fullTranslatedText = translatedCues.map((c) => c.text).join(' ');

    return {
      sourceText: rawSourceText,
      translatedText: fullTranslatedText,
      cues: translatedCues,
      modelUsed: overallModel,
      deviceUsed: overallDevice,
    };
  }
}
