export interface SubtitleCue {
  id: number;
  start: number; // in seconds
  end: number;   // in seconds
  text: string;
}

/**
 * Parses timestamp string like "00:01:23,456" or "00:01:23.456" into seconds
 */
export function parseTimestampToSeconds(timestamp: string): number {
  const clean = timestamp.trim().replace(',', '.');
  const parts = clean.split(':');
  if (parts.length === 3) {
    const hours = parseFloat(parts[0]);
    const minutes = parseFloat(parts[1]);
    const seconds = parseFloat(parts[2]);
    return hours * 3600 + minutes * 60 + seconds;
  }
  if (parts.length === 2) {
    const minutes = parseFloat(parts[0]);
    const seconds = parseFloat(parts[1]);
    return minutes * 60 + seconds;
  }
  return parseFloat(clean) || 0;
}

/**
 * Formats seconds into WebVTT timestamp format "00:00:00.000"
 */
export function formatSecondsToVtt(seconds: number): string {
  const safeSec = Math.max(0, seconds);
  const totalMs = Math.round(safeSec * 1000);
  const h = Math.floor(totalMs / 3600000);
  const m = Math.floor((totalMs % 3600000) / 60000);
  const s = Math.floor((totalMs % 60000) / 1000);
  const ms = totalMs % 1000;

  const hh = h.toString().padStart(2, '0');
  const mm = m.toString().padStart(2, '0');
  const ss = s.toString().padStart(2, '0');
  const mmm = ms.toString().padStart(3, '0');

  return `${hh}:${mm}:${ss}.${mmm}`;
}

/**
 * Converts SRT subtitle text into valid WebVTT string with optional sync offset
 * @param srt Raw SRT text
 * @param offsetSeconds Delay offset in seconds (e.g. +0.1 for +100ms, -0.05 for -50ms)
 */
export function srtToWebVtt(srt: string, offsetSeconds = 0): string {
  if (!srt || !srt.trim()) {
    return 'WEBVTT\n\n';
  }

  // Normalize line endings
  const normalized = srt.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const blocks = normalized.split(/\n\s*\n/);
  const vttBlocks: string[] = ['WEBVTT\n\n'];

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    if (lines.length < 2) continue;

    // Find timecode line (contains "-->")
    const timeIndex = lines.findIndex((l) => l.includes('-->'));
    if (timeIndex === -1) continue;

    const timeLine = lines[timeIndex];
    const [startRaw, endRaw] = timeLine.split('-->').map((s) => s.trim());
    if (!startRaw || !endRaw) continue;

    const startSec = Math.max(0, parseTimestampToSeconds(startRaw) + offsetSeconds);
    const endSec = Math.max(startSec + 0.1, parseTimestampToSeconds(endRaw) + offsetSeconds);

    const vttTimeLine = `${formatSecondsToVtt(startSec)} --> ${formatSecondsToVtt(endSec)}`;
    const textLines = lines.slice(timeIndex + 1).join('\n');

    vttBlocks.push(`${vttTimeLine}\n${textLines}\n\n`);
  }

  return vttBlocks.join('');
}

/**
 * Creates a Blob URL from SRT or WebVTT content for use in <track src="...">
 */
export function createSubtitleBlobUrl(content: string, offsetSeconds = 0): string {
  let vtt = content;
  if (!content.trim().startsWith('WEBVTT')) {
    vtt = srtToWebVtt(content, offsetSeconds);
  } else if (offsetSeconds !== 0) {
    // If it's already WebVTT but needs offset
    vtt = srtToWebVtt(content, offsetSeconds);
  }
  const blob = new Blob([vtt], { type: 'text/vtt' });
  return URL.createObjectURL(blob);
}
