export interface VadSegment {
  start: number; // in seconds
  end: number;   // in seconds
  speechProbability?: number;
}

export interface VadOptions {
  leadInPaddingMs?: number; // e.g. 200ms
  tailPaddingMs?: number;   // e.g. 300ms
  minSpeechDurationMs?: number; // e.g. 250ms
  maxSilenceMergeGapMs?: number; // e.g. 400ms
  speechThreshold?: number; // 0.0 to 1.0
}

export class VadProcessor {
  /**
   * Processes raw speech detections, applies lead-in/tail padding, merges adjacent dialogue bursts, and filters noise
   */
  public static processSegments(rawDetections: VadSegment[], totalDuration: number, options?: VadOptions): VadSegment[] {
    const leadInSec = ((options?.leadInPaddingMs ?? 200) / 1000);
    const tailSec = ((options?.tailPaddingMs ?? 300) / 1000);
    const minDurationSec = ((options?.minSpeechDurationMs ?? 250) / 1000);
    const maxGapSec = ((options?.maxSilenceMergeGapMs ?? 400) / 1000);

    if (rawDetections.length === 0) {
      return [];
    }

    // 1. Filter out tiny blips (pops/clicks under min speech duration)
    const filtered = rawDetections.filter((s) => (s.end - s.start) >= minDurationSec);

    if (filtered.length === 0) {
      return [];
    }

    // 2. Apply lead-in and tail padding bounded by totalDuration
    const padded = filtered.map((s) => ({
      start: Math.max(0, s.start - leadInSec),
      end: Math.min(totalDuration, s.end + tailSec),
      speechProbability: s.speechProbability,
    }));

    // 3. Merge overlapping or closely adjacent segments (within maxGapSec)
    padded.sort((a, b) => a.start - b.start);
    const merged: VadSegment[] = [];
    let current = padded[0];

    for (let i = 1; i < padded.length; i++) {
      const next = padded[i];
      if (next.start <= current.end + maxGapSec) {
        // Merge segments
        current = {
          start: current.start,
          end: Math.max(current.end, next.end),
          speechProbability: Math.max(current.speechProbability || 0, next.speechProbability || 0),
        };
      } else {
        merged.push(current);
        current = next;
      }
    }
    merged.push(current);

    return merged;
  }
}
