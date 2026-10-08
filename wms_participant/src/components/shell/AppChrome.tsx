import { View } from 'react-native';

import { AppBottomNav } from '@/components/shell/AppBottomNav';
import { AppNavMenuProvider } from '@/components/shell/AppNavMenu';
import { WebAppHeader } from '@/components/shell/WebAppHeader';
import { SCREEN_GUTTER_COMPACT, SCREEN_GUTTER_WIDE } from '@/constants/layout';
import type { AppNavTab } from '@/constants/navigation';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type AppChromeProps = {
  active: AppNavTab;
  children: React.ReactNode;
  /** Sits above the tab bar (compact) so CTAs never push tabs off-screen. */
  footer?: React.ReactNode;
  className?: string;
};

/**
 * Responsive app chrome — bottom tabs on compact web/native,
 * top header on wide web (≥768px).
 * Compact tabs stay pinned to the viewport; only `children` scroll.
 */
export function AppChrome({ active, children, footer, className }: AppChromeProps) {
  const { useBottomNav, useWebHeader } = useAppLayout();
  const contentGutter = useWebHeader ? SCREEN_GUTTER_WIDE : SCREEN_GUTTER_COMPACT;

  const body = (
    <View className="min-h-0 flex-1">
      <View className={cn('min-h-0 flex-1', contentGutter)}>{children}</View>
      {footer}
      {useBottomNav ? <AppBottomNav active={active} /> : null}
    </View>
  );

  return (
    <View className={cn('min-h-0 flex-1', className)}>
      {useWebHeader ? <WebAppHeader active={active} /> : null}
      {useBottomNav ? <AppNavMenuProvider active={active}>{body}</AppNavMenuProvider> : body}
    </View>
  );
}
