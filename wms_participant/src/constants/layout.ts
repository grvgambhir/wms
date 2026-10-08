/** Shared horizontal gutters — keep WebAppHeader and page content aligned. */
export const SCREEN_GUTTER_COMPACT = 'px-4';
export const SCREEN_GUTTER_WIDE = 'px-6 lg:px-12 xl:px-20';

/** Compact chrome (bottom nav) below this width on web. */
export const COMPACT_WEB_BREAKPOINT = 768;

/** Desktop grid / 3-column layouts at this width and above. */
export const DESKTOP_WEB_BREAKPOINT = 1280;

/**
 * Website content column — use on wide web instead of max-w-2xl/3xl phone strips.
 * Compact/native stay fluid inside the screen gutters.
 */
export const PAGE_CONTAINER = 'mx-auto w-full max-w-7xl';

/**
 * Web hover lift for pressable cards. Native ignores `hover:` so compact/iOS/Android stay unchanged.
 */
export const CARD_HOVER = 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl';

/** Page titles — compact stays mockup-sized; laptop steps up. */
export const PAGE_TITLE = 'text-2xl font-bold text-foreground lg:text-3xl';
export const PAGE_LEAD = 'text-sm leading-6 text-muted-foreground lg:text-base';

export type LayoutTier = 'compact' | 'tablet' | 'desktop';
export type GridColumns = 1 | 2 | 3 | 6;

/** Flex-basis class for wrap grids (NativeWind cannot do CSS grid on RN). */
export function gridItemClass(columns: GridColumns): string {
  switch (columns) {
    case 6:
      return 'w-[15.5%]';
    case 3:
      return 'w-[31.5%]';
    case 2:
      return 'w-[48%]';
    default:
      return 'w-full';
  }
}
