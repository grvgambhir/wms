import { View } from 'react-native';

import { PAGE_CONTAINER } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type WebPageLayoutProps = {
  children: React.ReactNode;
  className?: string;
};

/**
 * Website content column on wide web (max-w-7xl).
 * Compact/native stay full-bleed inside AppChrome gutters.
 */
export function WebPageLayout({ children, className }: WebPageLayoutProps) {
  const { isWideWeb } = useAppLayout();

  return (
    <View className={cn('min-h-0 w-full flex-1 py-4 lg:py-6', isWideWeb && PAGE_CONTAINER, className)}>
      {children}
    </View>
  );
}
