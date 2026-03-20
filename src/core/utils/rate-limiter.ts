/**
 * Token-bucket rate limiter with per-key (operator) buckets.
 *
 * Each operator gets an independent bucket that refills at a fixed rate.
 * When a bucket is empty, `acquire` waits until a token is available and
 * `tryAcquire` returns false immediately.
 */

interface Bucket {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketRateLimiter {
  private readonly buckets = new Map<number, Bucket>();

  /**
   * @param maxTokens       Maximum burst size (also the initial fill level).
   * @param refillPerMinute How many tokens are added per minute.
   */
  constructor(
    private readonly maxTokens: number,
    private readonly refillPerMinute: number,
  ) {}

  // ── Public API ──────────────────────────────────────────────────────────

  /**
   * Wait until a token is available for the given operator, then consume it.
   * Resolves immediately when a token is already available.
   */
  async acquire(operatorId: number): Promise<void> {
    this.refill(operatorId);
    const bucket = this.getOrCreate(operatorId);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return;
    }

    // Calculate how long until the next token arrives
    const tokensNeeded = 1 - bucket.tokens;
    const msPerToken = 60_000 / this.refillPerMinute;
    const waitMs = Math.ceil(tokensNeeded * msPerToken);

    await this.sleep(waitMs);

    // Refill again after sleeping, then consume
    this.refill(operatorId);
    const refreshed = this.getOrCreate(operatorId);
    refreshed.tokens = Math.max(refreshed.tokens - 1, 0);
  }

  /**
   * Try to consume a token without waiting.
   * @returns `true` if a token was consumed, `false` if the bucket is empty.
   */
  tryAcquire(operatorId: number): boolean {
    this.refill(operatorId);
    const bucket = this.getOrCreate(operatorId);

    if (bucket.tokens >= 1) {
      bucket.tokens -= 1;
      return true;
    }

    return false;
  }

  /**
   * Return the current token count for an operator (useful for diagnostics).
   */
  availableTokens(operatorId: number): number {
    this.refill(operatorId);
    return this.getOrCreate(operatorId).tokens;
  }

  /**
   * Remove a specific operator's bucket (e.g. on tenant offboarding).
   */
  reset(operatorId: number): void {
    this.buckets.delete(operatorId);
  }

  // ── Internals ───────────────────────────────────────────────────────────

  private getOrCreate(operatorId: number): Bucket {
    let bucket = this.buckets.get(operatorId);
    if (!bucket) {
      bucket = { tokens: this.maxTokens, lastRefill: Date.now() };
      this.buckets.set(operatorId, bucket);
    }
    return bucket;
  }

  private refill(operatorId: number): void {
    const bucket = this.getOrCreate(operatorId);
    const now = Date.now();
    const elapsedMs = now - bucket.lastRefill;
    const tokensToAdd = (elapsedMs / 60_000) * this.refillPerMinute;

    if (tokensToAdd > 0) {
      bucket.tokens = Math.min(this.maxTokens, bucket.tokens + tokensToAdd);
      bucket.lastRefill = now;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
