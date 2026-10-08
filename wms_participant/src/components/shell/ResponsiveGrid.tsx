import { Children } from 'react';
import { View } from 'react-native';

import { gridItemClass, type GridColumns } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type ResponsiveGridProps = {
  children: React.ReactNode;
  /** Override auto columns from layout tier. */
  columns?: GridColumns;
  className?: string;
};

/** Wrap-row grid that follows tablet/desktop column counts. */
export function ResponsiveGrid({ children, columns, className }: ResponsiveGridProps) {
  const { contentColumns } = useAppLayout();
  const cols = columns ?? contentColumns;
  const itemClass = gridItemClass(cols);

  return (
    <View className={cn('flex-row flex-wrap justify-between gap-y-3', className)}>
      {Children.map(children, (child, index) => (
        <View key={index} className={itemClass}>
          {child}
        </View>
      ))}
    </View>
  );
}
