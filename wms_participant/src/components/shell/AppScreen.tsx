import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WebMarketingHomeBar } from '@/components/shell/WebMarketingHomeBar';
import { GradientBackground } from '@/components/ui/gradient-background';
import { SCREEN_GUTTER_COMPACT, SCREEN_GUTTER_WIDE } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type AppScreenProps = {
  children: React.ReactNode;
  className?: string;
  /** Skip gradient atmosphere — used for auth-gate loading shells. */
  plain?: boolean;
};

/** Shared screen shell — viewport-locked so tab bars stay pinned like a native app. */
export function AppScreen({ children, className, plain = false }: AppScreenProps) {
  const insets = useSafeAreaInsets();
  const { variant, isWideWeb, isWeb } = useAppLayout();

  const useGradient = !plain && (variant === 'native' || variant === 'web-compact');
  const horizontalPadding = isWideWeb ? SCREEN_GUTTER_WIDE : SCREEN_GUTTER_COMPACT;

  const screenBody = (
    <View
      className={cn('min-h-0 flex-1', useGradient ? 'bg-transparent' : 'bg-background')}
      style={{ paddingTop: isWideWeb ? 0 : insets.top }}>
      {useGradient ? <GradientBackground /> : null}
      <View className={cn('min-h-0 w-full flex-1', horizontalPadding, className)}>{children}</View>
    </View>
  );

  return (
    <View className="h-full min-h-0 w-full flex-1 overflow-hidden bg-background">
      {isWeb ? <WebMarketingHomeBar /> : null}
      {screenBody}
    </View>
  );
}
