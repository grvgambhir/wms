import { Platform, useWindowDimensions } from 'react-native';

import {
  COMPACT_WEB_BREAKPOINT,
  DESKTOP_WEB_BREAKPOINT,
  type GridColumns,
  type LayoutTier,
} from '@/constants/layout';

export type AppLayoutVariant = 'native' | 'web-compact' | 'web-wide';

/** m.* / mobile.* host uses compact chrome (bottom nav) but still fluid full-width layout. */
function isMobileHost(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') {
    return false;
  }

  const host = window.location.hostname.toLowerCase();
  return host.startsWith('m.') || host.startsWith('mobile.');
}

/**
 * Responsive layout — one RN codebase, two presentations:
 * - compact (<768 or native / m.*): mobile app (bottom nav, stacked)
 * - tablet (768–1279): website chrome + 2-column arrangements
 * - desktop (≥1280): website chrome + 3-column where useful
 */
export function useAppLayout() {
  const { width } = useWindowDimensions();
  const isWeb = Platform.OS === 'web';

  if (!isWeb) {
    return {
      variant: 'native' as const,
      isWeb: false,
      isCompactWeb: false,
      isWideWeb: false,
      useBottomNav: true,
      useWebHeader: false,
      layoutTier: 'compact' as LayoutTier,
      contentColumns: 1 as GridColumns,
    };
  }

  const isCompactWeb = isMobileHost() || width < COMPACT_WEB_BREAKPOINT;
  const isWideWeb = !isCompactWeb;
  const layoutTier: LayoutTier = isCompactWeb
    ? 'compact'
    : width >= DESKTOP_WEB_BREAKPOINT
      ? 'desktop'
      : 'tablet';
  const contentColumns: GridColumns = layoutTier === 'desktop' ? 3 : layoutTier === 'tablet' ? 2 : 1;

  return {
    variant: (isWideWeb ? 'web-wide' : 'web-compact') as AppLayoutVariant,
    isWeb: true,
    isCompactWeb,
    isWideWeb,
    useBottomNav: isCompactWeb,
    useWebHeader: isWideWeb,
    layoutTier,
    contentColumns,
  };
}

/** @deprecated Use isWideWeb — kept for gradual screen migrations. */
export function useIsDesktopWeb() {
  const { isWideWeb } = useAppLayout();
  return isWideWeb;
}

export { COMPACT_WEB_BREAKPOINT };
