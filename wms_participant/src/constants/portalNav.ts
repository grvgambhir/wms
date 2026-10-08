// Portal navigation definitions (WS-A). Centralized so nav labels live in one
// place (constants module) and can move to i18n keys in WS-C without touching
// the shell. `href` is intentionally optional/unset for now — routing is wired
// as the real screens land (WS-C/WS-D); the shells drive selection via onNavigate.
// Screen map: BUSINESS_OVERVIEW_COMO2027 §7.
import type { CopyKey } from '@/i18n/types';
import {
  Activity,
  BadgeCheck,
  CalendarDays,
  CreditCard,
  FileText,
  HelpCircle,
  Inbox,
  type LucideIcon,
  MessageSquare,
  Trophy,
  User,
  Users,
} from 'lucide-react-native';
import type { Href } from 'expo-router';

export type PortalNavItem = {
  id: string;
  /** i18n key — resolved via `useCopy()` in the portal shells. */
  labelKey: CopyKey;
  icon: LucideIcon;
  href?: Href;
  badge?: string | number;
};

export type PortalNavSection = {
  id: string;
  labelKey?: CopyKey;
  items: PortalNavItem[];
};

/** Participant portal — single flat section (mockup p06/p08/p16). */
export const PARTICIPANT_NAV: PortalNavSection[] = [
  {
    id: 'main',
    items: [
      { id: 'dashboard', labelKey: 'portalNavDashboard', icon: Activity, href: '/registration-status' },
      { id: 'entries', labelKey: 'portalNavMyEntries', icon: Trophy, href: '/my-entries' },
      { id: 'team', labelKey: 'portalNavTeam', icon: Users, href: '/team-roster' },
      { id: 'invitations', labelKey: 'portalNavInvitations', icon: Inbox, href: '/invitations' },
      { id: 'evidence', labelKey: 'portalNavEvidence', icon: FileText, href: '/eligibility-evidence' },
      { id: 'payments', labelKey: 'portalNavPayments', icon: CreditCard, href: '/checkout' },
      { id: 'accreditation', labelKey: 'portalNavAccreditation', icon: BadgeCheck, href: '/my-accreditation' },
      { id: 'messages', labelKey: 'portalNavMessages', icon: MessageSquare, href: '/messages' },
      { id: 'games', labelKey: 'portalNavMyGames', icon: CalendarDays, href: '/my-games' },
      { id: 'profile', labelKey: 'navProfile', icon: User, href: '/profile' },
      { id: 'help', labelKey: 'portalNavHelp', icon: HelpCircle, href: '/help' },
    ],
  },
];
