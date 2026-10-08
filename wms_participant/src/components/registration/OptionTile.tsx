import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type OptionTileProps = {
  title: string;
  subtitle?: string;
  selected?: boolean;
  disabled?: boolean;
  onPress?: () => void;
  className?: string;
};

/** Compact selectable tile for A08 discipline / age / entry grids. */
export function OptionTile({ title, subtitle, selected, disabled, onPress, className }: OptionTileProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || !onPress}
      className={cn('active:scale-[0.99]', disabled && 'opacity-40', className)}>
      <View
        className={cn(
          'relative min-h-[72px] justify-center rounded-2xl border bg-white px-3 py-3',
          selected ? 'border-2 border-primary bg-primary/5' : 'border-border/70 hover:border-primary/40 hover:bg-primary/5',
        )}>
        {selected ? (
          <View className="absolute right-2 top-2 h-5 w-5 items-center justify-center rounded-full bg-primary">
            <Check size={12} color="#FFFFFF" />
          </View>
        ) : null}
        <Text className={cn('text-sm font-bold', selected ? 'text-primary' : 'text-foreground')}>{title}</Text>
        {subtitle ? <Text className="mt-1 text-xs text-muted-foreground">{subtitle}</Text> : null}
      </View>
    </Pressable>
  );
}