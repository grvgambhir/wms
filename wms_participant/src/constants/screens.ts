import { DEMO_IDS } from '@/constants/demo';

/**
 * Legacy A01–A18 screen identifiers (old athlete-only POC).
 * Being superseded by the Como 2027 portal screen map — see
 * context_docs/docs/BUSINESS_OVERVIEW_COMO2027.md §7 (WS-A migrates these).
 */
export type ScreenId =
  | 'A01'
  | 'A02'
  | 'A03'
  | 'A04'
  | 'A05'
  | 'A06'
  | 'A07'
  | 'A08'
  | 'A09'
  | 'A10'
  | 'A11'
  | 'A12'
  | 'A13'
  | 'A14'
  | 'A15'
  | 'A16'
  | 'A17'
  | 'A18';

export type ScreenMeta = {
  id: ScreenId;
  title: string;
  group: 'auth' | 'discovery' | 'registration' | 'main';
};

/** Static route for each screen in the main POC demo path. */
export const POC_FLOW_ROUTES: Record<ScreenId, string> = {
  A01: '/(auth)/login',
  A02: '/(auth)/otp',
  A03: '/(discovery)/events',
  A04: `/(discovery)/event/${DEMO_IDS.eventDemo}`,
  A05: `/(discovery)/event/${DEMO_IDS.eventDemo}/sports`,
  A06: '/(registration)/overview',
  A07: '/(discovery)/account',
  A08: '/(registration)/category',
  A09: '/(registration)/documents',
  A10: '/(registration)/photo',
  A11: '/(registration)/partner',
  A12: '/(registration)/partner-finder',
  A13: '/(registration)/review',
  A14: '/(registration)/payment',
  A15: '/(registration)/status',
  A16: '/(main)/accreditation',
  A17: '/(main)/gameshub',
  A18: `/(main)/match/${DEMO_IDS.matchTennisDemo}`,
};

/** Next screen in the canonical demo journey (undefined on A18). */
export const POC_FLOW_NEXT: Partial<Record<ScreenId, ScreenId>> = {
  A01: 'A02',
  A02: 'A03',
  A03: 'A04',
  A04: 'A05',
  A05: 'A06',
  A06: 'A08',
  A07: 'A08',
  A08: 'A09',
  A09: 'A10',
  A10: 'A11',
  A11: 'A12',
  A12: 'A13',
  A13: 'A14',
  A14: 'A15',
  A15: 'A16',
  A16: 'A17',
  A17: 'A18',
};

export const SCREEN_CATALOG: ScreenMeta[] = [
  { id: 'A01', title: 'Login / Sign Up', group: 'auth' },
  { id: 'A02', title: 'OTP Verification', group: 'auth' },
  { id: 'A03', title: 'Events', group: 'discovery' },
  { id: 'A04', title: 'Event Details', group: 'discovery' },
  { id: 'A05', title: 'Choose Sport', group: 'discovery' },
  { id: 'A06', title: 'Registration Overview', group: 'registration' },
  { id: 'A07', title: 'Personal Profile', group: 'discovery' },
  { id: 'A08', title: 'Sport & Category', group: 'registration' },
  { id: 'A09', title: 'Eligibility & Documents', group: 'registration' },
  { id: 'A10', title: 'Accreditation Photo', group: 'registration' },
  { id: 'A11', title: 'Partner / Team Setup', group: 'registration' },
  { id: 'A12', title: 'Partner Finder', group: 'registration' },
  { id: 'A13', title: 'Review + T&C', group: 'registration' },
  { id: 'A14', title: 'Payment', group: 'registration' },
  { id: 'A15', title: 'Registration Status', group: 'registration' },
  { id: 'A16', title: 'Digital Accreditation', group: 'main' },
  { id: 'A17', title: 'GamesHub Home', group: 'main' },
  { id: 'A18', title: 'Live Match / Result', group: 'main' },
];

export function getNextFlowRoute(screenId: ScreenId): string | undefined {
  const nextId = POC_FLOW_NEXT[screenId];
  return nextId ? POC_FLOW_ROUTES[nextId] : undefined;
}
