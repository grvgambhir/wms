export type AccessTokenProvider = {
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<string | null>;
};

const empty: AccessTokenProvider = {
  getAccessToken: async () => null,
  refreshAccessToken: async () => null,
};

let provider: AccessTokenProvider = empty;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessTokenProvider(next: AccessTokenProvider): void {
  provider = next;
  refreshInFlight = null;
}

export function resetAccessTokenProvider(): void {
  provider = empty;
  refreshInFlight = null;
}

export async function getAccessToken(): Promise<string | null> {
  return provider.getAccessToken();
}

export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = provider.refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
