// Participant portal shell palette (WS-A): a dark-navy sidebar over a light
// content area (existing WMS-blue tokens). Centralized here so no portal hex is
// hardcoded in components (DESIGN_SYSTEM rule).
import { colors } from './colors';

export type PortalTheme = {
  sidebarBg: string;
  sidebarBgElevated: string;
  sidebarText: string;
  sidebarTextMuted: string;
  sidebarTextActive: string;
  sidebarActiveBg: string;
  sidebarBorder: string;
  topbarBg: string;
  topbarBorder: string;
  contentBg: string;
};

/** Participant portal — deep navy sidebar, WMS-blue active item. */
export const portalTheme: PortalTheme = {
  sidebarBg: '#0E2233',
  sidebarBgElevated: '#13293C',
  sidebarText: '#C4D2DF',
  sidebarTextMuted: '#7F94A6',
  sidebarTextActive: '#FFFFFF',
  sidebarActiveBg: colors.primary, // #4887CA
  sidebarBorder: 'rgba(255,255,255,0.08)',
  topbarBg: colors.surface,
  topbarBorder: colors.border,
  contentBg: colors.background,
};
