import { ApiError, authorizedFetch } from "../api/httpClient";
import { wmsBackendBaseUrl } from "./env";

type ProblemBody = {
  code?: string;
  detail?: string;
  message?: string;
};

/**
 * HTTP helper for wms_backend (:3050). Same bearer + 401-refresh as `apiRequest`,
 * but the error body is RFC 9457 (`detail`, not `message`).
 */
export async function backendRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  const response = await authorizedFetch(
    `${wmsBackendBaseUrl()}${path}`,
    init,
    headers,
  );
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ProblemBody | null;
    throw new ApiError(
      body?.code ?? "HTTP_ERROR",
      body?.detail ?? body?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  return (await response.json()) as T;
}

/** CSV exports use the same bearer + problem-details handling as JSON requests. */
export async function backendRequestText(
  path: string,
  init: RequestInit = {},
): Promise<string> {
  const headers = new Headers(init.headers);
  const response = await authorizedFetch(
    `${wmsBackendBaseUrl()}${path}`,
    init,
    headers,
  );
  if (!response.ok) {
    const body = (await response
      .json()
      .catch(() => null)) as ProblemBody | null;
    throw new ApiError(
      body?.code ?? "HTTP_ERROR",
      body?.detail ?? body?.message ?? `Request failed (${response.status})`,
      response.status,
    );
  }
  return response.text();
}
