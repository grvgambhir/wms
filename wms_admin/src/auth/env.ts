function flag(value: string | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

export function cognitoConfig(): {
  region: string;
  userPoolId: string;
  userPoolClientId: string;
} | null {
  const region = import.meta.env.VITE_COGNITO_REGION?.trim() ?? '';
  const userPoolId = import.meta.env.VITE_COGNITO_USER_POOL_ID?.trim() ?? '';
  const userPoolClientId = import.meta.env.VITE_COGNITO_CLIENT_ID?.trim() ?? '';
  if (!region || !userPoolId || !userPoolClientId) return null;
  return { region, userPoolId, userPoolClientId };
}

export function wmsBackendBaseUrl(): string {
  const configured = import.meta.env.VITE_WMS_BACKEND_URL;
  const raw = typeof configured === 'string' && configured.trim().length > 0 ? configured : 'http://localhost:3050';
  return raw.replace(/\/$/, '');
}

export function isDemoAuthEnabled(): boolean {
  return flag(import.meta.env.VITE_DEMO_AUTH);
}
