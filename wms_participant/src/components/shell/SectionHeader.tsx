import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type SectionHeaderProps = {
  title: string;
  subtitle?: string;
  className?: string;
};

/** Consistent section title row — used on GamesHub, events, and registration blocks. */
export function SectionHeader({ title, subtitle, className }: SectionHeaderProps) {
  return (
    <View className={cn('gap-0.5', className)}>
      <Text accessibilityRole="header" className="text-sm font-bold uppercase tracking-wide text-foreground lg:text-base">{title}</Text>
      {subtitle ? <Text className="text-xs text-muted-foreground lg:text-sm">{subtitle}</Text> : null}
    </View>
  );
}
