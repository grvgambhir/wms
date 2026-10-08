import type { Href } from 'expo-router';

import { copy } from '@/constants/copy';

/** Shared primary nav tabs — bottom bar (mobile) and top header (desktop web). */
export type AppNavTab = 'home' | 'events' | 'registrations' | 'profile';

export const APP_NAV_TABS: { id: AppNavTab; label: string; href: Href }[] = [
  { id: 'home', label: copy.navHome, href: '/(main)/gameshub' },
  { id: 'events', label: copy.navEvents, href: '/(discovery)/events' },
  { id: 'registrations', label: copy.navRegistrations, href: '/(registration)' },
  { id: 'profile', label: copy.navProfile, href: '/(discovery)/account' },
];
