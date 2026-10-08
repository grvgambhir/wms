/**
 * Access-token source for the HTTP helper. Cognito is plugged in at boot;
 * tests inject a fake so they never load Amplify or AWS.
 */

export type AccessTokenProvider = {
  getAccessToken(): Promise<string | null>;
  refreshAccessToken(): Promise<string | null>;
};

const emptyProvider: AccessTokenProvider = {
  getAccessToken: async () => null,
  refreshAccessToken: async () => null,
};

let provider: AccessTokenProvider = emptyProvider;
let refreshInFlight: Promise<string | null> | null = null;

export function setAccessTokenProvider(next: AccessTokenProvider): void {
  provider = next;
  refreshInFlight = null;
}

export function resetAccessTokenProvider(): void {
  provider = emptyProvider;
  refreshInFlight = null;
}

export async function getAccessToken(): Promise<string | null> {
  return provider.getAccessToken();
}

/** Single-flight refresh so concurrent 401s do not stampede Cognito. */
export async function refreshAccessToken(): Promise<string | null> {
  if (!refreshInFlight) {
    refreshInFlight = provider.refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}
