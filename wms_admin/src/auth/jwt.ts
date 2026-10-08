export type JwtPayload = {
  token_use?: unknown;
  sub?: unknown;
  exp?: unknown;
};

function base64UrlToJson(part: string): JwtPayload {
  const padded = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
  const raw = globalThis.atob(padded);
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

export function assertAccessToken(token: string): string {
  const payload = decodeJwtPayload(token);
  if (!payload || payload.token_use !== 'access') {
    throw new Error('auth.token.not_access');
  }
  return token;
}

export function encodeUnsignedJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: 'none', typ: 'JWT' }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `${header}.${body}.sig`;
}
