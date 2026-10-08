import { getAccessToken } from './accessToken';
import { wmsBackendBaseUrl } from './env';

export type MeProfile = {
  id: string;
  email?: string | null;
  givenName?: string;
  familyName?: string;
  profileStatus?: string;
  roles: string[];
  mfa?: {
    enrolled: boolean;
    enforcementActive: boolean;
    enrolledOcAdminCount: number;
  };
};

const OC_ROLES = new Set(['oc_admin', 'oc_staff', 'finance']);

export function hasOcRole(roles: string[] | undefined): boolean {
  return (roles ?? []).some((role) => OC_ROLES.has(role));
}

export function hasOcAdminRole(roles: string[] | undefined): boolean {
  return (roles ?? []).includes('oc_admin');
}

/** Roles come from the API, never from cognito:groups or token claims. */
export async function fetchMe(): Promise<MeProfile | null> {
  const token = await getAccessToken();
  if (!token) return null;
  const response = await fetch(`${wmsBackendBaseUrl()}/v1/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as MeProfile;
  return { ...body, roles: Array.isArray(body.roles) ? body.roles : [] };
}
