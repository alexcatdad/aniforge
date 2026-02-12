export interface RateLimiterConfig {
  requests: number;
  perSeconds: number;
}

export class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly maxTokens: number;
  private readonly refillIntervalMs: number;
  private readonly refillAmount: number;

  constructor(config: RateLimiterConfig) {
    this.maxTokens = config.requests;
    this.tokens = config.requests;
    this.refillAmount = config.requests;
    this.refillIntervalMs = config.perSeconds * 1000;
    this.lastRefill = Date.now();
  }

  private refill(): void {
    const now = Date.now();
    const elapsed = now - this.lastRefill;
    const refillCycles = Math.floor(elapsed / this.refillIntervalMs);

    if (refillCycles > 0) {
      this.tokens = Math.min(this.maxTokens, this.tokens + refillCycles * this.refillAmount);
      this.lastRefill += refillCycles * this.refillIntervalMs;
    }
  }

  async acquire(): Promise<void> {
    this.refill();

    if (this.tokens >= 1) {
      this.tokens -= 1;
      return;
    }

    const waitTime = this.refillIntervalMs - (Date.now() - this.lastRefill);
    await this.delay(waitTime);
    return this.acquire();
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  configure(config: RateLimiterConfig): void {
    this.tokens = config.requests;
    this.lastRefill = Date.now();
  }
}
