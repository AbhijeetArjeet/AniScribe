/**
 * Parses HTTP Retry-After header.
 * Formats:
 * 1. Integer seconds: "120"
 * 2. HTTP-Date: "Wed, 21 Oct 2026 07:28:00 GMT"
 *
 * Returns retry timestamp in milliseconds.
 */
export function parseRetryAfter(headerValue: string | undefined | null, defaultDelayMs: number = 5000): { retryAt: number; delayMs: number } {
  const now = Date.now();
  if (!headerValue || typeof headerValue !== 'string') {
    return { retryAt: now + defaultDelayMs, delayMs: defaultDelayMs };
  }

  const trimmed = headerValue.trim();

  // Check if it's delta-seconds (all digits)
  if (/^\d+$/.test(trimmed)) {
    const seconds = parseInt(trimmed, 10);
    const delayMs = Math.max(1000, seconds * 1000);
    return { retryAt: now + delayMs, delayMs };
  }

  // Otherwise try parsing as HTTP-Date
  const parsedDate = Date.parse(trimmed);
  if (!isNaN(parsedDate)) {
    const diff = parsedDate - now;
    const delayMs = diff > 1000 ? diff : defaultDelayMs;
    return { retryAt: now + delayMs, delayMs };
  }

  return { retryAt: now + defaultDelayMs, delayMs: defaultDelayMs };
}
