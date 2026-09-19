import path from 'path';

const WINDOWS_RESERVED_NAMES = new Set([
  'CON',
  'PRN',
  'AUX',
  'NUL',
  'COM1',
  'COM2',
  'COM3',
  'COM4',
  'COM5',
  'COM6',
  'COM7',
  'COM8',
  'COM9',
  'LPT1',
  'LPT2',
  'LPT3',
  'LPT4',
  'LPT5',
  'LPT6',
  'LPT7',
  'LPT8',
  'LPT9',
]);

/**
 * Sanitizes a filename to ensure safe storage across all operating systems.
 * - Strips directory traversal (..)
 * - Replaces illegal filesystem characters (\ / : * ? " < > | \0) with underscores
 * - Avoids Windows reserved filenames (CON, PRN, AUX, etc.)
 * - Truncates excessively long filenames (> 255 chars)
 */
export function sanitizeFilename(filename: string): string {
  if (!filename || !filename.trim()) {
    return 'unnamed_file';
  }

  // Strip path traversal and path separators
  let clean = filename
    .replace(/\.\./g, '_')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .trim();

  // Strip leading/trailing dots and spaces
  clean = clean.replace(/^[. ]+|[. ]+$/g, '');

  if (!clean) {
    clean = 'unnamed_file';
  }

  const ext = path.extname(clean);
  const base = path.basename(clean, ext);

  // Check reserved Windows names
  if (WINDOWS_RESERVED_NAMES.has(base.toUpperCase())) {
    clean = `_${clean}`;
  }

  // Truncate to maximum 240 chars to ensure safety on all filesystems
  if (clean.length > 240) {
    clean = clean.slice(0, 240);
  }

  return clean;
}
