import { View } from 'react-native';

import { AppChrome } from '@/components/shell/AppChrome';
import { SCREEN_GUTTER_COMPACT } from '@/constants/layout';
import type { AppNavTab } from '@/constants/navigation';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type StackWebChromeProps = {
  active: AppNavTab;
  children: React.ReactNode;
  /** Compact only — e.g. BottomActionBar. Wide uses WebAppHeader instead. */
  footer?: React.ReactNode;
};

/**
 * Stack screens (event detail, choose sport) get website top nav on wide web
 * without adding compact bottom tabs to the flow.
 */
export function StackWebChrome({ active, children, footer }: StackWebChromeProps) {
  const { isWideWeb } = useAppLayout();

  if (isWideWeb) {
    return <AppChrome active={active}>{children}</AppChrome>;
  }

  return (
    <View className="min-h-0 flex-1">
      <View className={cn('min-h-0 flex-1', SCREEN_GUTTER_COMPACT)}>{children}</View>
      {footer}
    </View>
  );
}
