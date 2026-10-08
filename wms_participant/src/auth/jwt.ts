/**
 * Decode a JWT payload without verifying the signature. Used only to refuse
 * sending an id token (token_use=id) — the API verifies the access token.
 */

export type JwtPayload = {
  token_use?: unknown;
  sub?: unknown;
  exp?: unknown;
  username?: unknown;
};

function base64UrlToJson(part: string): JwtPayload {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const raw =
    typeof globalThis.atob === 'function'
      ? globalThis.atob(padded)
      : Buffer.from(padded, 'base64').toString('utf8');
  return JSON.parse(raw) as JwtPayload;
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts[1]) return null;
  try {
    return base64UrlToJson(parts[1]);
  } catch {
    return null;
  }
}

/** Access tokens only. An id token carries email/name and the API rejects it. */
export function assertAccessToken(token: string): string {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.token_use !== 'access') {
    throw new Error('auth.token.not_access');
  }
  return token;
}

export function isExpiredJwt(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const payload = decodeJwtPayload(token);
  return typeof payload?.exp === 'number' && payload.exp <= nowSeconds;
}

export function encodeUnsignedJwt(payload: Record<string, unknown>): string {
  const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${header}.${body}.sig`;
}
