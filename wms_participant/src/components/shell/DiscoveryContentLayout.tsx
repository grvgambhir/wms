import { View } from 'react-native';

import { SCREEN_GUTTER_COMPACT, SCREEN_GUTTER_WIDE } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type DiscoverySize = 'md' | 'lg' | 'xl';

const MAX_WIDTH: Record<DiscoverySize, string> = {
  md: 'max-w-4xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
};

type DiscoveryContentLayoutProps = {
  children: React.ReactNode;
  /** Centered max width on wide web — fluid on compact/native. */
  size?: DiscoverySize;
  className?: string;
};

/** Centers discovery sub-screens (event detail, choose sport) on wide web. */
export function DiscoveryContentLayout({
  children,
  size = 'lg',
  className,
}: DiscoveryContentLayoutProps) {
  const { isWideWeb } = useAppLayout();

  return (
    <View
      className={cn(
        'min-h-0 w-full flex-1',
        isWideWeb ? SCREEN_GUTTER_WIDE : SCREEN_GUTTER_COMPACT,
        isWideWeb && ['mx-auto', MAX_WIDTH[size]],
        className,
      )}>
      {children}
    </View>
  );
}
