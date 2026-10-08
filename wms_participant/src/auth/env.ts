/** Cognito + demo-auth flags. Metro inlines EXPO_PUBLIC_* at bundle time. */

function flag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function isDemoAuthEnabled(): boolean {
  return flag(process.env.EXPO_PUBLIC_DEMO_AUTH);
}

export function cognitoConfig(): {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
} | null {
  const region = process.env.EXPO_PUBLIC_COGNITO_REGION?.trim() ?? '';
  const userPoolId = process.env.EXPO_PUBLIC_COGNITO_USER_POOL_ID?.trim() ?? '';
  const userPoolClientId = process.env.EXPO_PUBLIC_COGNITO_CLIENT_ID?.trim() ?? '';
  if (!region || !userPoolId || !userPoolClientId) return null;
  return { region, userPoolId, userPoolClientId };
}

export function wmsBackendBaseUrl(): string | null {
  const configured = process.env.EXPO_PUBLIC_WMS_BACKEND_URL?.trim();
  if (!configured) return null;
  return configured.replace(/\/$/, '');
}
