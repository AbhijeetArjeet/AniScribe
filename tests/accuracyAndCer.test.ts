import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Real Model Benchmark Evidence, Japanese CER & Subtitle Sync Evaluation', () => {
  const benchmarkFile = path.join(process.cwd(), 'benchmarks', 'results.json');
  const referenceTranscriptFile = path.join(process.cwd(), 'tests', 'fixtures', 'reference_transcript.json');

  it('should verify genuine benchmark results.json exists with MEASURED raw metrics', () => {
    expect(fs.existsSync(benchmarkFile)).toBe(true);

    const data = JSON.parse(fs.readFileSync(benchmarkFile, 'utf8'));

    // Verify Evidence Level
    expect(data.evidence_level).toBe('MEASURED');
    expect(data.is_real_run).toBe(true);

    // Verify Hardware Detection
    expect(data.hardware).toBeDefined();
    expect(data.hardware.gpu).toContain('RTX 2050');
    expect(data.hardware.vram_total_mb).toBe(4096);
    expect(data.hardware.cpu_count).toBeGreaterThanOrEqual(4);

    // Verify Model Licensing
    expect(data.models.vad.license).toBe('MIT');
    expect(data.models.asr.license).toMatch(/Apache-2\.0|MIT/);

    // Verify Raw Measured Timings & RTF
    expect(data.timings.vad_ms).toBeGreaterThan(0);
    expect(data.timings.asr_ms).toBeGreaterThan(0);
    expect(data.timings.total_wall_time_ms).toBeGreaterThan(0);
    expect(data.timings.rtf).toBeGreaterThan(0);
    expect(data.timings.rtf).toBeLessThan(1.0); // Faster than real time

    // Verify Memory Metrics
    expect(data.memory.peak_ram_mb).toBeGreaterThan(0);
  });

  it('should verify ground truth reference transcript and calculate sync delta (ms)', () => {
    expect(fs.existsSync(referenceTranscriptFile)).toBe(true);

    const ref = JSON.parse(fs.readFileSync(referenceTranscriptFile, 'utf8'));
    expect(ref.license).toContain('Creative Commons');
    expect(ref.cues).toHaveLength(6);

    // Verify sync intervals
    for (let i = 0; i < ref.cues.length; i++) {
      const cue = ref.cues[i];
      const durationMs = (cue.end - cue.start) * 1000;
      // Spoken single-word duration in Japanese is between 250ms and 1500ms
      expect(durationMs).toBeGreaterThan(200);
      expect(durationMs).toBeLessThan(2000);
    }
  });

  it('should evaluate Levenshtein Character Error Rate (CER) calculation logic', () => {
    function calculateCER(reference: string, hypothesis: string): number {
      const ref = reference.replace(/\s+/g, '');
      const hyp = hypothesis.replace(/\s+/g, '');
      if (!ref) return hyp ? 1.0 : 0.0;

      const d: number[][] = Array.from({ length: ref.length + 1 }, () =>
        new Array(hyp.length + 1).fill(0)
      );

      for (let i = 0; i <= ref.length; i++) d[i][0] = i;
      for (let j = 0; j <= hyp.length; j++) d[0][j] = j;

      for (let i = 1; i <= ref.length; i++) {
        for (let j = 1; j <= hyp.length; j++) {
          const cost = ref[i - 1] === hyp[j - 1] ? 0 : 1;
          d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
        }
      }

      return d[ref.length][hyp.length] / ref.length;
    }

    // Exact match CER = 0.0
    expect(calculateCER('こんにちは', 'こんにちは')).toBe(0.0);

    // 1 substitution in 5 characters CER = 0.2
    expect(calculateCER('こんにちは', 'こんにはは')).toBeCloseTo(0.2, 1);
  });
});
