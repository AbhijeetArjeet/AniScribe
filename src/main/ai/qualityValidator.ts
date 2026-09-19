import { SubtitleCue, QualityReport, QualityWarning } from '../../shared/types/offlineEngine';

export class QualityValidator {
  /**
   * Audits subtitle cues for production quality, timing, overlaps, and readable pacing
   */
  public static validate(cues: SubtitleCue[]): QualityReport {
    const warnings: QualityWarning[] = [];
    let totalCps = 0;
    let maxCps = 0;
    let untranslatedCount = 0;

    if (cues.length === 0) {
      return {
        isValid: false,
        totalCues: 0,
        warnings: [{ type: 'empty', message: 'No subtitle cues generated.' }],
        averageCharactersPerSecond: 0,
        maxCharactersPerSecond: 0,
        untranslatedRatio: 0,
        score: 0,
      };
    }

    for (let i = 0; i < cues.length; i++) {
      const cue = cues[i];
      const duration = cue.end - cue.start;

      // 1. Inverted or zero timestamp
      if (duration <= 0) {
        warnings.push({
          type: 'syntax',
          message: `Cue ${cue.id} has invalid duration (${duration.toFixed(2)}s).`,
          cueId: cue.id,
          timestamp: cue.start,
        });
      }

      // 2. Empty text
      if (!cue.text || cue.text.trim().length === 0) {
        warnings.push({
          type: 'empty',
          message: `Cue ${cue.id} contains empty text.`,
          cueId: cue.id,
          timestamp: cue.start,
        });
      }

      // 3. Characters per second (CPS) check
      const charCount = cue.text.replace(/\s+/g, '').length;
      const cps = duration > 0 ? charCount / duration : 0;
      totalCps += cps;
      if (cps > maxCps) maxCps = cps;

      if (cps > 25 && duration > 0.5) {
        warnings.push({
          type: 'excessive_cps',
          message: `Cue ${cue.id} reading speed is too fast (${cps.toFixed(1)} chars/sec).`,
          cueId: cue.id,
          timestamp: cue.start,
        });
      }

      // 4. Excessive duration (> 7s) or too short (< 0.5s)
      if (duration > 7.0) {
        warnings.push({
          type: 'excessive_duration',
          message: `Cue ${cue.id} remains on screen too long (${duration.toFixed(1)}s).`,
          cueId: cue.id,
          timestamp: cue.start,
        });
      } else if (duration < 0.5 && charCount > 5) {
        warnings.push({
          type: 'too_short',
          message: `Cue ${cue.id} is too short to read (${duration.toFixed(2)}s).`,
          cueId: cue.id,
          timestamp: cue.start,
        });
      }

      // 5. Overlap with next cue
      if (i < cues.length - 1) {
        const nextCue = cues[i + 1];
        if (cue.end > nextCue.start + 0.01) {
          warnings.push({
            type: 'overlap',
            message: `Cue ${cue.id} overlaps with Cue ${nextCue.id} by ${(cue.end - nextCue.start).toFixed(2)}s.`,
            cueId: cue.id,
            timestamp: cue.end,
          });
        }

        // Consecutive duplicate check
        if (cue.text.trim().toLowerCase() === nextCue.text.trim().toLowerCase()) {
          warnings.push({
            type: 'duplicate',
            message: `Cue ${cue.id} and ${nextCue.id} have identical consecutive text.`,
            cueId: nextCue.id,
            timestamp: nextCue.start,
          });
        }
      }

      // 6. Check for untranslated Japanese characters (Hiragana, Katakana, Kanji)
      if (/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(cue.text)) {
        untranslatedCount++;
      }
    }

    const avgCps = totalCps / cues.length;
    const untranslatedRatio = untranslatedCount / cues.length;

    if (untranslatedCount > 0) {
      warnings.push({
        type: 'untranslated',
        message: `${untranslatedCount} cue(s) (${Math.round(untranslatedRatio * 100)}%) contain untranslated Japanese characters.`,
      });
    }

    // Compute quality score
    let score = 100;
    score -= warnings.filter((w) => w.type === 'syntax' || w.type === 'overlap').length * 15;
    score -= warnings.filter((w) => w.type === 'excessive_cps' || w.type === 'empty').length * 5;
    score -= warnings.filter((w) => w.type === 'excessive_duration' || w.type === 'too_short').length * 5;
    score -= Math.round(untranslatedRatio * 30);
    score = Math.max(0, Math.min(100, score));

    return {
      isValid: warnings.filter((w) => w.type === 'syntax' || w.type === 'overlap').length === 0,
      totalCues: cues.length,
      warnings,
      averageCharactersPerSecond: Math.round(avgCps * 10) / 10,
      maxCharactersPerSecond: Math.round(maxCps * 10) / 10,
      untranslatedRatio: Math.round(untranslatedRatio * 100) / 100,
      score,
    };
  }
}
