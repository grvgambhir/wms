import { View } from 'react-native';

import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type SplitPageLayoutProps = {
  main: React.ReactNode;
  rail: React.ReactNode;
  className?: string;
};

/** Stacked on compact; ~5/8 + 3/8 columns on tablet/desktop.
 *  Rail must be a real panel (card + copy), not a lone full-width button.
 */
export function SplitPageLayout({ main, rail, className }: SplitPageLayoutProps) {
  const { isWideWeb } = useAppLayout();

  return (
    <View className={cn('gap-4', isWideWeb && 'flex-row items-start', className)}>
      <View className={cn('gap-4', isWideWeb && 'min-w-0')} style={isWideWeb ? { flex: 5 } : undefined}>
        {main}
      </View>
      <View className={cn('gap-4', isWideWeb && 'min-w-0')} style={isWideWeb ? { flex: 3 } : undefined}>
        {rail}
      </View>
    </View>
  );
}
