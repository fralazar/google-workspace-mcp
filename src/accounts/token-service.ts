import { mintToken } from './service-account.js';

const EXPIRY_BUFFER = 60_000; // refresh 1 minute before expiry

interface CachedToken {
  accessToken: string;
  expiresAt: number;
}

/** In-memory access token cache — lives for the MCP session. */
const cache = new Map<string, CachedToken>();

/** In-flight refresh promises — deduplicates concurrent requests for the same account. */
const inflight = new Map<string, Promise<string>>();

export class TokenRefreshError extends Error {
  constructor(
    message: string,
    public readonly email: string,
    public readonly googleError?: string,
  ) {
    super(message);
    this.name = 'TokenRefreshError';
  }
}

/**
 * Get a valid access token for an impersonated user.
 *
 * Returns from cache if >60s remaining, otherwise mints a new token
 * via the service account JWT flow.
 */
export async function getAccessToken(email: string): Promise<string> {
  const cached = cache.get(email);
  if (cached && cached.expiresAt > Date.now() + EXPIRY_BUFFER) {
    return cached.accessToken;
  }

  // Deduplicate concurrent refresh requests for the same account
  const pending = inflight.get(email);
  if (pending) return pending;

  const promise = refreshToken(email);
  inflight.set(email, promise);
  try {
    return await promise;
  } finally {
    inflight.delete(email);
  }
}

async function refreshToken(email: string): Promise<string> {
  try {
    const { access_token, expires_in } = await mintToken(email);

    cache.set(email, {
      accessToken: access_token,
      expiresAt: Date.now() + (expires_in * 1000),
    });

    return access_token;
  } catch (err) {
    cache.delete(email);
    throw new TokenRefreshError(
      `Token mint failed for ${email}: ${(err as Error).message}`,
      email,
      (err as Error).message,
    );
  }
}

/** Evict a cached token — forces next getAccessToken to refresh. */
export function invalidateToken(email: string): void {
  cache.delete(email);
  inflight.delete(email);
}

/** Prefetch tokens for all given accounts (fire-and-forget, logs errors). */
export async function warmTokenCache(emails: string[]): Promise<void> {
  const results = await Promise.allSettled(
    emails.map(email => getAccessToken(email)),
  );

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (result.status === 'rejected') {
      process.stderr.write(
        `[gws-mcp] token warmup failed for ${emails[i]}: ${(result.reason as Error).message}\n`,
      );
    }
  }
}

/** Visible for testing — clear the entire cache. */
export function _clearCache(): void {
  cache.clear();
  inflight.clear();
}
