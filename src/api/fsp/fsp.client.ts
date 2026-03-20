import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TokenBucketRateLimiter } from '../../core/utils/rate-limiter.js';
import { mockRoute } from './mock/mock-router.js';

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

// ─── HTTP Response Envelope ──────────────────────────────────────────────────

export interface FspHttpResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class FspClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown,
  ) {
    super(message);
    this.name = 'FspClientError';
  }
}

export class FspCircuitOpenError extends Error {
  constructor(operatorId: number) {
    super(`Circuit breaker open for operator ${operatorId}. Requests are blocked until recovery.`);
    this.name = 'FspCircuitOpenError';
  }
}

// ─── Client ──────────────────────────────────────────────────────────────────

@Injectable()
export class FspClient {
  private readonly logger = new Logger(FspClient.name);

  /** Per-operator rate limiter: 60 requests/min with burst up to 60. */
  private readonly rateLimiter = new TokenBucketRateLimiter(60, 60);

  /** Per-operator circuit breaker state. */
  private readonly circuitBreakers = new Map<number, CircuitBreakerState>();

  // Circuit breaker tunables
  private readonly CIRCUIT_FAILURE_THRESHOLD = 5;
  private readonly CIRCUIT_RESET_MS = 60_000;

  // Retry / backoff tunables
  private readonly MAX_RETRIES = 4; // up to 4 retries (5 total attempts)
  private readonly INITIAL_BACKOFF_MS = 1_000;
  private readonly MAX_BACKOFF_MS = 30_000;

  // Base URLs (resolved lazily on first use)
  private _apiBaseUrl?: string;
  private _coreBaseUrl?: string;
  private _curriculumBaseUrl?: string;
  private _subscriptionKey?: string;

  private _mockMode?: boolean;

  constructor(private readonly config: ConfigService) {}

  private get mockMode(): boolean {
    return (this._mockMode ??= this.config.get('FSP_MOCK_MODE') === 'true');
  }

  private get apiBaseUrl(): string {
    return (this._apiBaseUrl ??= this.requiredConfig('FSP_API_BASE_URL'));
  }
  private get coreBaseUrl(): string {
    return (this._coreBaseUrl ??= this.requiredConfig('FSP_CORE_BASE_URL'));
  }
  private get curriculumBaseUrl(): string {
    return (this._curriculumBaseUrl ??= this.requiredConfig('FSP_CURRICULUM_BASE_URL'));
  }
  private get subscriptionKey(): string {
    return (this._subscriptionKey ??= this.requiredConfig('FSP_SUBSCRIPTION_KEY'));
  }

  // ── Convenience methods for each base URL ─────────────────────────────

  async apiGet<T>(operatorId: number, path: string, token: string): Promise<T> {
    return this.request<T>('GET', this.apiBaseUrl, path, operatorId, token);
  }

  async apiPost<T>(operatorId: number, path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', this.apiBaseUrl, path, operatorId, token, body);
  }

  async apiPut<T>(operatorId: number, path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('PUT', this.apiBaseUrl, path, operatorId, token, body);
  }

  async apiDelete<T>(operatorId: number, path: string, token: string): Promise<T> {
    return this.request<T>('DELETE', this.apiBaseUrl, path, operatorId, token);
  }

  async coreGet<T>(operatorId: number, path: string, token: string): Promise<T> {
    return this.request<T>('GET', this.coreBaseUrl, path, operatorId, token);
  }

  async corePost<T>(operatorId: number, path: string, token: string, body?: unknown): Promise<T> {
    return this.request<T>('POST', this.coreBaseUrl, path, operatorId, token, body);
  }

  async coreDelete<T>(operatorId: number, path: string, token: string): Promise<T> {
    return this.request<T>('DELETE', this.coreBaseUrl, path, operatorId, token);
  }

  async curriculumGet<T>(operatorId: number, path: string, token: string): Promise<T> {
    return this.request<T>('GET', this.curriculumBaseUrl, path, operatorId, token);
  }

  async curriculumPost<T>(
    operatorId: number,
    path: string,
    token: string,
    body?: unknown,
  ): Promise<T> {
    return this.request<T>('POST', this.curriculumBaseUrl, path, operatorId, token, body);
  }

  // ── Auth-specific helpers (no operator rate-limiting) ─────────────────

  /**
   * Auth calls don't belong to any operator yet, so they skip operator-level
   * rate limiting and circuit breakers. They still use the subscription key.
   */
  async authPost<T>(path: string, body?: unknown, token?: string): Promise<T> {
    if (this.mockMode) {
      const mock = mockRoute('POST', path, body);
      return (mock?.body ?? {}) as T;
    }
    const url = `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-subscription-key': this.subscriptionKey,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    this.logger.debug(`AUTH POST ${url}`);

    const response = await fetch(url, {
      method: 'POST',
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });

    const data = await this.parseResponse(response);

    if (!response.ok) {
      throw new FspClientError(
        `FSP auth POST ${path} failed with status ${response.status}`,
        response.status,
        data,
      );
    }

    return data as T;
  }

  async authGet<T>(path: string, token: string): Promise<T> {
    if (this.mockMode) {
      const mock = mockRoute('GET', path);
      return (mock?.body ?? {}) as T;
    }
    const url = `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-subscription-key': this.subscriptionKey,
      Authorization: `Bearer ${token}`,
    };

    this.logger.debug(`AUTH GET ${url}`);

    const response = await fetch(url, { method: 'GET', headers });
    const data = await this.parseResponse(response);

    if (!response.ok) {
      throw new FspClientError(
        `FSP auth GET ${path} failed with status ${response.status}`,
        response.status,
        data,
      );
    }

    return data as T;
  }

  async authDelete<T>(path: string, token: string): Promise<T> {
    if (this.mockMode) {
      const mock = mockRoute('DELETE', path);
      return (mock?.body ?? {}) as T;
    }
    const url = `${this.apiBaseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-subscription-key': this.subscriptionKey,
      Authorization: `Bearer ${token}`,
    };

    this.logger.debug(`AUTH DELETE ${url}`);

    const response = await fetch(url, { method: 'DELETE', headers });
    const data = await this.parseResponse(response);

    if (!response.ok) {
      throw new FspClientError(
        `FSP auth DELETE ${path} failed with status ${response.status}`,
        response.status,
        data,
      );
    }

    return data as T;
  }

  // ── Core request pipeline ─────────────────────────────────────────────

  private async request<T>(
    method: string,
    baseUrl: string,
    path: string,
    operatorId: number,
    token: string,
    body?: unknown,
  ): Promise<T> {
    // Mock mode — bypass all HTTP, rate limiting, circuit breakers
    if (this.mockMode) {
      const mock = mockRoute(method, path, body);
      return (mock?.body ?? {}) as T;
    }

    // 1. Circuit breaker check
    this.assertCircuitClosed(operatorId);

    // 2. Rate limit (waits if necessary)
    await this.rateLimiter.acquire(operatorId);

    // 3. Execute with exponential backoff on 429
    return this.executeWithRetry<T>(method, baseUrl, path, operatorId, token, body);
  }

  private async executeWithRetry<T>(
    method: string,
    baseUrl: string,
    path: string,
    operatorId: number,
    token: string,
    body?: unknown,
    attempt = 0,
  ): Promise<T> {
    const url = `${baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-subscription-key': this.subscriptionKey,
      Authorization: `Bearer ${token}`,
    };

    this.logger.debug(`${method} ${url} [operator=${operatorId}, attempt=${attempt}]`);

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers,
        body: body != null ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      // Network-level failure — counts toward circuit breaker
      this.recordFailure(operatorId);
      throw new FspClientError(
        `FSP ${method} ${path} network error: ${(err as Error).message}`,
        0,
        null,
      );
    }

    // 429 Too Many Requests → exponential backoff & retry
    if (response.status === 429 && attempt < this.MAX_RETRIES) {
      const backoff = Math.min(this.INITIAL_BACKOFF_MS * Math.pow(2, attempt), this.MAX_BACKOFF_MS);
      this.logger.warn(
        `Rate limited by FSP (429) for operator ${operatorId}. ` +
          `Retrying in ${backoff}ms (attempt ${attempt + 1}/${this.MAX_RETRIES})`,
      );
      await this.sleep(backoff);
      return this.executeWithRetry<T>(method, baseUrl, path, operatorId, token, body, attempt + 1);
    }

    const data = await this.parseResponse(response);

    // Server errors (5xx) count toward circuit breaker
    if (response.status >= 500) {
      this.recordFailure(operatorId);
      throw new FspClientError(
        `FSP ${method} ${path} server error ${response.status}`,
        response.status,
        data,
      );
    }

    // 4xx (other than 429 handled above) are caller errors — don't trip breaker
    if (!response.ok) {
      throw new FspClientError(
        `FSP ${method} ${path} failed with status ${response.status}`,
        response.status,
        data,
      );
    }

    // Success — reset circuit breaker
    this.recordSuccess(operatorId);

    return data as T;
  }

  // ── Circuit breaker helpers ───────────────────────────────────────────

  private getCircuit(operatorId: number): CircuitBreakerState {
    let state = this.circuitBreakers.get(operatorId);
    if (!state) {
      state = { failures: 0, lastFailure: 0, isOpen: false };
      this.circuitBreakers.set(operatorId, state);
    }
    return state;
  }

  private assertCircuitClosed(operatorId: number): void {
    const state = this.getCircuit(operatorId);

    if (!state.isOpen) return;

    // Check if enough time has passed for a half-open probe
    const elapsed = Date.now() - state.lastFailure;
    if (elapsed >= this.CIRCUIT_RESET_MS) {
      this.logger.log(
        `Circuit breaker half-open for operator ${operatorId}. Allowing probe request.`,
      );
      // Stay "open" but allow one request through — success will reset
      return;
    }

    throw new FspCircuitOpenError(operatorId);
  }

  private recordFailure(operatorId: number): void {
    const state = this.getCircuit(operatorId);
    state.failures += 1;
    state.lastFailure = Date.now();

    if (state.failures >= this.CIRCUIT_FAILURE_THRESHOLD) {
      state.isOpen = true;
      this.logger.error(
        `Circuit breaker OPEN for operator ${operatorId} after ${state.failures} failures. ` +
          `Blocking requests for ${this.CIRCUIT_RESET_MS / 1_000}s.`,
      );
    }
  }

  private recordSuccess(operatorId: number): void {
    const state = this.getCircuit(operatorId);
    if (state.failures > 0 || state.isOpen) {
      this.logger.log(`Circuit breaker reset for operator ${operatorId} after successful request.`);
    }
    state.failures = 0;
    state.isOpen = false;
    state.lastFailure = 0;
  }

  // ── Utilities ─────────────────────────────────────────────────────────

  private async parseResponse(response: Response): Promise<unknown> {
    const text = await response.text();
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private requiredConfig(key: string): string {
    const value = this.config.get<string>(key);
    if (!value) {
      throw new Error(`Missing required configuration: ${key}`);
    }
    return value;
  }
}
