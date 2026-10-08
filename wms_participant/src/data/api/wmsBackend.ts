/** HTTP helper for the Nest backend (localhost:3050). */
import { getAccessToken, refreshAccessToken } from '@/auth/accessToken';
import { wmsBackendBaseUrl } from '@/auth/env';
import { RepositoryError } from '@/data/errors/repositoryError';

export const DEFAULT_WMS_BACKEND_URL = 'http://localhost:3050';

export function backendBaseUrl(): string {
  return wmsBackendBaseUrl() ?? DEFAULT_WMS_BACKEND_URL;
}

type ProblemBody = {
  code?: string;
  message?: string;
  detail?: string;
  message_key?: string;
  errors?: Record<string, string>;
  fields?: Record<string, string>;
  status?: number;
};

type BackendRequestOptions = RequestInit & {
  idempotencyKey?: string;
  /** Match mock getRule: missing records are null, not an exception. */
  nullOn404?: boolean;
};

async function authorizedFetch(url: string, init: RequestInit, headers: Headers): Promise<Response> {
  const token = await getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  let response = await fetch(url, { ...init, headers });
  if (response.status !== 401 || !token) return response;
  const refreshed = await refreshAccessToken();
  if (!refreshed || refreshed === token) return response;
  const retryHeaders = new Headers(headers);
  retryHeaders.set('Authorization', `Bearer ${refreshed}`);
  return fetch(url, { ...init, headers: retryHeaders });
}

function errorFromProblem(body: ProblemBody | null, status: number): RepositoryError {
  if (status === 401) {
    return new RepositoryError({ code: 'UNAUTHORIZED', message: 'unauthorized' });
  }
  const messageKey =
    (typeof body?.message_key === 'string' && body.message_key) ||
    (typeof body?.detail === 'string' && !body.detail.includes(' ') ? body.detail : undefined);
  return new RepositoryError({
    code: body?.code ?? 'HTTP_ERROR',
    message: messageKey ?? body?.detail ?? body?.message ?? `Request failed (${status})`,
    fields: body?.errors ?? body?.fields,
  });
}

export async function backendRequest<T>(path: string, init: BackendRequestOptions = {}): Promise<T> {
  const { idempotencyKey, nullOn404, ...fetchInit } = init;
  const headers = new Headers(fetchInit.headers);
  if (fetchInit.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (idempotencyKey) {
    headers.set('Idempotency-Key', idempotencyKey);
  }

  let response: Response;
  try {
    response = await authorizedFetch(`${backendBaseUrl()}${path}`, fetchInit, headers);
  } catch (caught) {
    const message = caught instanceof Error ? caught.message : 'network';
    throw new RepositoryError({ code: 'NETWORK_ERROR', message });
  }

  if (!response.ok) {
    if (nullOn404 && response.status === 404) {
      return null as T;
    }
    const body = (await response.json().catch(() => null)) as ProblemBody | null;
    throw errorFromProblem(body, response.status);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

export function queryString(params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value.length > 0) {
      search.set(key, value);
    }
  }
  const encoded = search.toString();
  return encoded.length > 0 ? `?${encoded}` : '';
}
