import zlib from 'zlib';

export interface HallucinationCheckResult {
  isValid: boolean;
  cleanedText: string;
  reason?: string;
}

export class HallucinationGuard {
  // Known repetitive Whisper hallucination phrases (often triggered by silence or music)
  private static KNOWN_HALLUCINATIONS = [
    /ご視聴ありがとうございました/g,
    /チャンネル登録/g,
    /高評価/g,
    /Subtitles by/gi,
    /Thank you for watching/gi,
    /Please subscribe/gi,
    /Translated by/gi,
  ];

  /**
   * Evaluates and sanitizes ASR text against hallucination loops, low confidence, and repetitive noise
   */
  public static filter(
    text: string,
    options?: {
      confidence?: number;
      noSpeechProb?: number;
      compressionRatioThreshold?: number;
    }
  ): HallucinationCheckResult {
    const trimmed = text.trim();
    if (!trimmed) {
      return { isValid: false, cleanedText: '', reason: 'Empty text' };
    }

    // 1. Gated probability check
    if (options?.noSpeechProb !== undefined && options.noSpeechProb > 0.65) {
      return { isValid: false, cleanedText: '', reason: `High no-speech probability (${options.noSpeechProb.toFixed(2)})` };
    }

    if (options?.confidence !== undefined && options.confidence < 0.25) {
      return { isValid: false, cleanedText: '', reason: `Low confidence score (${options.confidence.toFixed(2)})` };
    }

    // 2. Repetition & Compression ratio check
    // Repetitive loops compress down to almost zero bytes
    if (trimmed.length > 25) {
      const compressed = zlib.deflateSync(Buffer.from(trimmed, 'utf8'));
      const ratio = compressed.length / Buffer.byteLength(trimmed, 'utf8');
      const threshold = options?.compressionRatioThreshold ?? 0.45;

      // If text is abnormally repetitive (compression ratio very low)
      if (ratio < threshold) {
        return { isValid: false, cleanedText: '', reason: `Abnormal text repetition loop (compression ratio: ${ratio.toFixed(2)})` };
      }
    }

    // 3. N-gram consecutive phrase loop detection
    const words = trimmed.split(/\s+/);
    if (words.length >= 6) {
      let repeatedCount = 0;
      for (let i = 0; i < words.length - 2; i++) {
        if (words[i] === words[i + 1] && words[i] === words[i + 2]) {
          repeatedCount++;
        }
      }
      if (repeatedCount >= 2) {
        return { isValid: false, cleanedText: '', reason: 'Excessive single-word repetition' };
      }
    }

    // 4. Filter known YouTube/Whisper credit hallucinations
    let cleaned = trimmed;
    for (const pat of this.KNOWN_HALLUCINATIONS) {
      if (pat.test(cleaned)) {
        cleaned = cleaned.replace(pat, '').trim();
      }
    }

    if (!cleaned) {
      return { isValid: false, cleanedText: '', reason: 'Contained only hallucinated end-card text' };
    }

    // 5. Filter music / lyric symbols when no speech present
    if (/^[♪♫♬\s]+$/.test(cleaned)) {
      return { isValid: false, cleanedText: '', reason: 'Non-speech musical symbol only' };
    }

    return { isValid: true, cleanedText: cleaned };
  }

  /**
   * Aligns requested chunk duration to natural VAD silence gaps with overlap.
   * Ensures chunk cuts never slice through spoken words in mid-syllable.
   */
  public static alignChunkToVadSilence(
    targetStart: number,
    targetEnd: number,
    speechSegments: Array<{ start: number; end: number }>,
    overlapSeconds: number = 0.2
  ): { start: number; end: number } {
    let alignedEnd = targetEnd;

    // Check if targetEnd falls inside an active speech segment
    const intersectingSpeech = speechSegments.find(
      (seg) => seg.start < targetEnd && seg.end > targetEnd
    );

    if (intersectingSpeech) {
      // Extend end timestamp to end of word/sentence plus overlap padding
      alignedEnd = intersectingSpeech.end + overlapSeconds;
    } else {
      alignedEnd = targetEnd + overlapSeconds;
    }

    return {
      start: Math.max(0, targetStart),
      end: alignedEnd,
    };
  }
}
