import { Platform, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PAGE_CONTAINER, SCREEN_GUTTER_WIDE } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';
import { glass } from '@/theme/glass';

type BottomActionBarProps = {
  children: React.ReactNode;
  className?: string;
  /** Align CTA with the max-w-7xl page container on wide web. */
  constrain?: boolean;
  /** Skip home-indicator padding when the tab bar below already owns it. */
  flush?: boolean;
};

/** Frosted bottom CTA bar for registration and form flows. */
export function BottomActionBar({
  children,
  className,
  constrain = false,
  flush = false,
}: BottomActionBarProps) {
  const insets = useSafeAreaInsets();
  const { isWideWeb } = useAppLayout();

  return (
    <View
      className={cn('shrink-0 border-t pt-4', !constrain && 'px-4', className)}
      style={{
        paddingBottom: flush ? 16 : Math.max(insets.bottom, 16),
        backgroundColor: glass.backgroundStrong,
        borderTopColor: glass.borderSubtle,
        ...(Platform.OS === 'web'
          ? {}
          : {
              shadowColor: glass.shadow,
              shadowOffset: { width: 0, height: -4 },
              shadowOpacity: 0.8,
              shadowRadius: 16,
            }),
      }}>
      {constrain ? (
        <View
          className={cn(
            'mx-auto w-full',
            isWideWeb ? cn(PAGE_CONTAINER, SCREEN_GUTTER_WIDE) : 'px-4',
          )}>
          {children}
        </View>
      ) : (
        children
      )}
    </View>
  );
}
