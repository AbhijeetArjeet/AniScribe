import { describe, it, expect } from 'vitest';
import { VadProcessor } from '../src/main/ai/vadProcessor';
import { QualityValidator } from '../src/main/ai/qualityValidator';
import { SubtitleCue } from '../src/shared/types/offlineEngine';

describe('VAD Processing & Subtitle Quality Validator', () => {
  it('should apply lead-in and tail padding to speech detections and merge adjacent bursts', () => {
    const rawSpeech = [
      { start: 2.0, end: 3.5, speechProbability: 0.9 },
      { start: 3.8, end: 5.0, speechProbability: 0.95 }, // close gap (0.3s) should merge
      { start: 10.0, end: 12.0, speechProbability: 0.85 },
    ];

    const processed = VadProcessor.processSegments(rawSpeech, 20.0, {
      leadInPaddingMs: 200, // -0.2s
      tailPaddingMs: 300,   // +0.3s
      maxSilenceMergeGapMs: 400, // 0.4s
    });

    expect(processed.length).toBe(2);
    // First segment starts with lead-in: 2.0 - 0.2 = 1.8s
    expect(processed[0].start).toBeCloseTo(1.8, 2);
    // First and second merged, ending with tail: 5.0 + 0.3 = 5.3s
    expect(processed[0].end).toBeCloseTo(5.3, 2);

    // Second segment
    expect(processed[1].start).toBeCloseTo(9.8, 2);
    expect(processed[1].end).toBeCloseTo(12.3, 2);
  });

  it('should filter out brief audio blips shorter than minSpeechDuration', () => {
    const rawSpeech = [
      { start: 1.0, end: 1.05, speechProbability: 0.5 }, // 50ms click
      { start: 3.0, end: 4.5, speechProbability: 0.9 },   // valid speech
    ];

    const processed = VadProcessor.processSegments(rawSpeech, 10.0, {
      minSpeechDurationMs: 200,
    });

    expect(processed.length).toBe(1);
    expect(processed[0].start).toBeLessThan(3.0);
  });

  it('should detect quality issues like overlaps, excessive reading speed, and untranslated text', () => {
    const badCues: SubtitleCue[] = [
      {
        id: 1,
        start: 1.0,
        end: 4.0,
        text: 'This is an extremely long subtitle that will overlap with the next cue and has way too many words to read in this short duration.',
      },
      {
        id: 2,
        start: 3.0, // Overlaps with cue 1 (starts at 3.0 while cue 1 ends at 4.0)
        end: 3.2, // Only 0.2s duration (too short)
        text: 'Too fast',
      },
      {
        id: 3,
        start: 5.0,
        end: 15.0, // 10s duration (too long)
        text: 'Lingering on screen forever',
      },
      {
        id: 4,
        start: 16.0,
        end: 18.0,
        text: 'ここは日本語のテキストがそのまま残っています', // Untranslated Japanese
      },
    ];

    const report = QualityValidator.validate(badCues);
    expect(report.isValid).toBe(false);

    const overlapWarning = report.warnings.find((w) => w.type === 'overlap');
    expect(overlapWarning).toBeDefined();

    const durationWarning = report.warnings.find((w) => w.type === 'excessive_duration');
    expect(durationWarning).toBeDefined();

    const untranslatedWarning = report.warnings.find((w) => w.type === 'untranslated');
    expect(untranslatedWarning).toBeDefined();

    expect(report.score).toBeLessThan(70);
  });
});
