import { getAccessToken, refreshAccessToken } from '../auth/accessToken';

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
  }
}

export async function authorizedFetch(url: string, init: RequestInit, headers: Headers): Promise<Response> {
  const token = await getAccessToken();
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  const response = await fetch(url, { ...init, headers });
  if (response.status !== 401 || !token) return response;
  const refreshed = await refreshAccessToken();
  if (!refreshed || refreshed === token) return response;
  const retryHeaders = new Headers(headers);
  retryHeaders.set('Authorization', `Bearer ${refreshed}`);
  return fetch(url, { ...init, headers: retryHeaders });
}
