import { readFileSync } from 'node:fs';
import { SignJWT, importPKCS8 } from 'jose';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';

/** Google service account JSON key file structure. */
export interface ServiceAccountKey {
  type: 'service_account';
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain?: string;
}

/** Service name to OAuth scope URL(s). */
export const SERVICE_SCOPE_MAP: Record<string, string[]> = {
  gmail:    ['https://www.googleapis.com/auth/gmail.readonly'],
  drive:    ['https://www.googleapis.com/auth/drive.readonly'],
  calendar: ['https://www.googleapis.com/auth/calendar.readonly'],
  sheets:   ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  docs:     ['https://www.googleapis.com/auth/documents.readonly'],
  tasks:    ['https://www.googleapis.com/auth/tasks.readonly'],
  slides:   ['https://www.googleapis.com/auth/presentations.readonly'],
  meet:     ['https://www.googleapis.com/auth/meetings.space.readonly'],
};

/** All scopes flattened — service accounts request all upfront. */
const ALL_SCOPES = Object.values(SERVICE_SCOPE_MAP).flat();

/** All service names. */
export const ALL_SERVICES = Object.keys(SERVICE_SCOPE_MAP).join(',');

/** Cached parsed key — loaded once per process. */
let cachedKey: ServiceAccountKey | null = null;

/**
 * Load service account key from GOOGLE_SERVICE_ACCOUNT_KEY env var.
 * Accepts a file path or inline JSON.
 */
export function loadServiceAccountKey(): ServiceAccountKey {
  if (cachedKey) return cachedKey;

  const envVal = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  if (!envVal) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_KEY environment variable is required. ' +
      'Set it to the path of a service account JSON key file or inline JSON.',
    );
  }

  let raw: string;
  if (envVal.trimStart().startsWith('{')) {
    raw = envVal;
  } else {
    try {
      raw = readFileSync(envVal, 'utf-8');
    } catch (err) {
      throw new Error(`Failed to read service account key file at ${envVal}: ${(err as Error).message}`);
    }
  }

  const parsed = JSON.parse(raw) as Record<string, unknown>;

  if (parsed.type !== 'service_account') {
    throw new Error(`Invalid service account key: expected type "service_account", got "${parsed.type}"`);
  }
  if (!parsed.private_key || !parsed.client_email || !parsed.token_uri) {
    throw new Error('Invalid service account key: missing private_key, client_email, or token_uri');
  }

  cachedKey = parsed as unknown as ServiceAccountKey;
  return cachedKey;
}

/**
 * Mint an access token by signing a JWT and exchanging it at Google's token endpoint.
 * The JWT includes sub=email to impersonate the given domain user.
 */
export async function mintToken(email: string): Promise<{ access_token: string; expires_in: number }> {
  const key = loadServiceAccountKey();
  const privateKey = await importPKCS8(key.private_key, 'RS256');

  const jwt = await new SignJWT({ scope: ALL_SCOPES.join(' ') })
    .setProtectedHeader({ alg: 'RS256', kid: key.private_key_id })
    .setIssuer(key.client_email)
    .setSubject(email)
    .setAudience(key.token_uri)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(privateKey);

  const response = await fetch(key.token_uri || GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const desc = body.error_description || body.error || response.statusText;
    throw new Error(
      `Service account token exchange failed for ${email} (${response.status}): ${desc}. ` +
      'Verify domain-wide delegation is configured in Google Admin Console for this service account and scopes.',
    );
  }

  const data = await response.json() as { access_token: string; expires_in: number };
  return data;
}

/** Reset cached key — for testing. */
export function _resetCache(): void {
  cachedKey = null;
}
