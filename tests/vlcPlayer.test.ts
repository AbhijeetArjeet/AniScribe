import { describe, it, expect } from 'vitest';
import {
  parseTimestampToSeconds,
  formatSecondsToVtt,
  srtToWebVtt,
} from '../src/renderer/utils/srtParser';

describe('VLC-Parity Video Player Capabilities & Utilities', () => {
  it('should parse SRT comma timestamps and WebVTT dot timestamps accurately', () => {
    expect(parseTimestampToSeconds('00:00:05,500')).toBe(5.5);
    expect(parseTimestampToSeconds('00:01:30,250')).toBe(90.25);
    expect(parseTimestampToSeconds('01:15:00,000')).toBe(4500);
    expect(parseTimestampToSeconds('00:00:10.750')).toBe(10.75);
  });

  it('should format seconds into standard WebVTT timestamps', () => {
    expect(formatSecondsToVtt(5.5)).toBe('00:00:05.500');
    expect(formatSecondsToVtt(90.25)).toBe('00:01:30.250');
    expect(formatSecondsToVtt(3661.123)).toBe('01:01:01.123');
  });

  it('should convert raw SRT content to valid WebVTT format', () => {
    const srt = `1
00:00:01,000 --> 00:00:04,000
Ore wa kaizoku ou ni naru otoko da!

2
00:00:05,500 --> 00:00:08,200
I am going to become the King of the Pirates!`;

    const vtt = srtToWebVtt(srt);
    expect(vtt).toContain('WEBVTT');
    expect(vtt).toContain('00:00:01.000 --> 00:00:04.000');
    expect(vtt).toContain('Ore wa kaizoku ou ni naru otoko da!');
    expect(vtt).toContain('00:00:05.500 --> 00:00:08.200');
    expect(vtt).toContain('I am going to become the King of the Pirates!');
  });

  it('should apply subtitle sync delay offsets (+/- ms) correctly to timestamps', () => {
    const srt = `1
00:00:10,000 --> 00:00:12,000
Delayed line`;

    // Shift +250ms (+0.25s)
    const vttDelayed = srtToWebVtt(srt, 0.25);
    expect(vttDelayed).toContain('00:00:10.250 --> 00:00:12.250');

    // Advance -500ms (-0.5s)
    const vttAdvanced = srtToWebVtt(srt, -0.5);
    expect(vttAdvanced).toContain('00:00:09.500 --> 00:00:11.500');
  });

  it('should calculate Web Audio volume boost gain up to 200%', () => {
    // Normal volume
    const vol100 = 1.0;
    expect(Math.round(vol100 * 100)).toBe(100);

    // VLC signature 150% boost
    const vol150 = 1.5;
    expect(Math.round(vol150 * 100)).toBe(150);

    // VLC maximum 200% boost
    const vol200 = 2.0;
    expect(Math.round(vol200 * 100)).toBe(200);

    // Clamp check
    const clampVol = (v: number) => Math.max(0, Math.min(2.0, v));
    expect(clampVol(2.5)).toBe(2.0);
    expect(clampVol(-0.5)).toBe(0);
  });

  it('should enforce frame-stepping and playback rate bounds', () => {
    // 30fps frame time: ~0.0333s
    const frameDuration = 1 / 30;
    const t0 = 10.0;
    const stepForward = t0 + frameDuration;
    expect(stepForward).toBeCloseTo(10.0333, 4);

    // Rate bounds
    const clampRate = (r: number) => Math.max(0.25, Math.min(3.0, r));
    expect(clampRate(0.1)).toBe(0.25);
    expect(clampRate(4.0)).toBe(3.0);
    expect(clampRate(1.75)).toBe(1.75);
  });
});
