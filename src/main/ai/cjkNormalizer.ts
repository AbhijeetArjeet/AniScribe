/**
 * Japanese and CJK Text Normalizer for Speech Recognition Evaluation.
 * Prevents false CER/WER penalties caused by:
 * 1. Fullwidth vs Halfwidth alphanumeric characters (１２３ -> 123, ＡＢＣ -> ABC)
 * 2. Kanji numbers vs Arabic digits in transcriptions (一 -> 1, 二 -> 2, etc.)
 * 3. Japanese punctuation vs Western punctuation (、 -> ,, 。 -> ., ！ -> !)
 * 4. Whitespace and zero-width spaces
 */
export class CjkNormalizer {
  private static KANJI_DIGITS: Record<string, string> = {
    '〇': '0', '零': '0',
    '一': '1', '壱': '1',
    '二': '2', '弐': '2',
    '三': '3', '参': '3',
    '四': '4',
    '五': '5',
    '六': '6',
    '七': '7',
    '八': '8',
    '九': '9',
    '十': '10', '拾': '10',
    '百': '100',
    '千': '1000',
    '万': '10000',
  };

  /**
   * Normalizes CJK text for fair, standardized CER comparison
   */
  public static normalize(text: string, options?: { convertKanjiNumbers?: boolean }): string {
    if (!text) return '';

    let normalized = text.trim();

    // 1. Convert Fullwidth alphanumeric and punctuation to Halfwidth (NFKC normalization)
    normalized = normalized.normalize('NFKC');

    // 2. Normalize Japanese punctuation marks
    normalized = normalized
      .replace(/[、，]/g, ',')
      .replace(/[。．]/g, '.')
      .replace(/[！]/g, '!')
      .replace(/[？]/g, '?')
      .replace(/[：]/g, ':')
      .replace(/[「」『』"']/g, '')
      .replace(/[〜～]/g, '~');

    // 3. Optional: Convert individual Kanji numeral characters to Arabic digits for counting clips
    if (options?.convertKanjiNumbers ?? true) {
      for (const [kanji, digit] of Object.entries(this.KANJI_DIGITS)) {
        normalized = normalized.split(kanji).join(digit);
      }
    }

    // 4. Remove all remaining spaces between CJK characters (Japanese text is unspaced)
    normalized = normalized.replace(/\s+/g, '');

    return normalized.toLowerCase();
  }

  /**
   * Calculates Character Error Rate (CER) with fair CJK normalization
   */
  public static calculateCer(reference: string, hypothesis: string): {
    cer: number;
    normalizedReference: string;
    normalizedHypothesis: string;
  } {
    const normRef = this.normalize(reference);
    const normHyp = this.normalize(hypothesis);

    if (!normRef) {
      return {
        cer: normHyp ? 1.0 : 0.0,
        normalizedReference: normRef,
        normalizedHypothesis: normHyp,
      };
    }

    const n = normRef.length;
    const m = normHyp.length;
    const d: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));

    for (let i = 0; i <= n; i++) d[i][0] = i;
    for (let j = 0; j <= m; j++) d[0][j] = j;

    for (let i = 1; i <= n; i++) {
      for (let j = 1; j <= m; j++) {
        const cost = normRef[i - 1] === normHyp[j - 1] ? 0 : 1;
        d[i][j] = Math.min(
          d[i - 1][j] + 1,      // deletion
          d[i][j - 1] + 1,      // insertion
          d[i - 1][j - 1] + cost // substitution
        );
      }
    }

    const distance = d[n][m];
    const cer = Math.round((distance / n) * 1000) / 1000;

    return {
      cer,
      normalizedReference: normRef,
      normalizedHypothesis: normHyp,
    };
  }
}
