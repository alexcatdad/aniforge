export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  jitterMs: number;
  retryableStatusCodes: number[];
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  jitterMs: 500,
  retryableStatusCodes: [429, 500, 502, 503, 504],
};

export function getRetryDelay(attempt: number, config: Partial<RetryConfig> = {}): number {
  const { baseDelayMs, jitterMs } = { ...DEFAULT_RETRY_CONFIG, ...config };
  const exponentialDelay = baseDelayMs * 2 ** attempt;
  const jitter = Math.random() * jitterMs * 2 - jitterMs;
  return Math.max(0, exponentialDelay + jitter);
}

export function isRetryable(status: number, config: Partial<RetryConfig> = {}): boolean {
  const { retryableStatusCodes } = { ...DEFAULT_RETRY_CONFIG, ...config };
  return retryableStatusCodes.includes(status);
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const { maxRetries } = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < maxRetries) {
        const delay = getRetryDelay(attempt, config);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error("Max retries exceeded");
}

export function parseRetryAfter(header: string | null): number {
  if (!header) return 0;

  const seconds = Number.parseInt(header, 10);
  if (!Number.isNaN(seconds)) {
    return seconds * 1000;
  }

  const date = new Date(header);
  if (!Number.isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return 0;
}
