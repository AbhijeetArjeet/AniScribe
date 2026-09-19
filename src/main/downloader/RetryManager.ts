import { HttpClient } from '../network/HttpClient';
import { parseRetryAfter } from '../network/RetryAfter';

export interface RetryPlan {
  shouldRetry: boolean;
  retryAt?: number;
  delayMs?: number;
  reason?: string;
}

export class RetryManager {
  private countdownTimer: NodeJS.Timeout | null = null;
  private isCancelled: boolean = false;

  static calculatePlan(
    err: any,
    currentRetryCount: number,
    maxRetries: number,
    baseDelayMs: number = 5000
  ): RetryPlan {
    if (currentRetryCount >= maxRetries) {
      return { shouldRetry: false, reason: `Max retries (${maxRetries}) exceeded` };
    }

    const statusCode = err?.statusCode;
    const isRetryableStatus = statusCode ? HttpClient.isRetryableStatusCode(statusCode) : false;
    const isRetryableNetErr = HttpClient.isRetryableError(err);

    if (!isRetryableStatus && !isRetryableNetErr) {
      return { shouldRetry: false, reason: err?.message || 'Non-retryable error' };
    }

    let delayMs = baseDelayMs * Math.pow(1.5, currentRetryCount);
    let reason = 'Temporary network failure';

    if (statusCode === 429) {
      reason = 'Server requested a retry (rate limit)';
      const retryAfterHeader = err?.headers?.['retry-after'];
      const parsed = parseRetryAfter(retryAfterHeader, baseDelayMs);
      delayMs = parsed.delayMs;
    } else if (statusCode && statusCode >= 500) {
      reason = `Server error (${statusCode})`;
      const retryAfterHeader = err?.headers?.['retry-after'];
      if (retryAfterHeader) {
        const parsed = parseRetryAfter(retryAfterHeader, baseDelayMs);
        delayMs = parsed.delayMs;
      }
    }

    const retryAt = Date.now() + delayMs;

    return {
      shouldRetry: true,
      retryAt,
      delayMs,
      reason,
    };
  }

  async waitForRetry(
    retryAt: number,
    reason: string,
    onCountdown: (secondsRemaining: number, reason: string) => void
  ): Promise<boolean> {
    this.isCancelled = false;

    return new Promise((resolve) => {
      const checkCountdown = () => {
        if (this.isCancelled) {
          if (this.countdownTimer) clearInterval(this.countdownTimer);
          return resolve(false);
        }

        const remainingMs = retryAt - Date.now();
        const secondsRemaining = Math.max(0, Math.ceil(remainingMs / 1000));

        onCountdown(secondsRemaining, reason);

        if (remainingMs <= 0) {
          if (this.countdownTimer) clearInterval(this.countdownTimer);
          resolve(true);
        }
      };

      // Initial tick
      checkCountdown();

      this.countdownTimer = setInterval(checkCountdown, 1000);
    });
  }

  cancel(): void {
    this.isCancelled = true;
    if (this.countdownTimer) {
      clearInterval(this.countdownTimer);
      this.countdownTimer = null;
    }
  }
}
