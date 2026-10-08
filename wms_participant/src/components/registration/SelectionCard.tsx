import { Check } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type SelectionCardProps = {
  title: string;
  subtitle?: string;
  selected?: boolean;
  onPress?: () => void;
  className?: string;
};

/** Tappable option row for discipline/category pickers on A08. */
export function SelectionCard({ title, subtitle, selected, onPress, className }: SelectionCardProps) {
  return (
    <Pressable onPress={onPress} disabled={!onPress} className="active:scale-[0.99]">
      <GlassSurface
        className={cn('flex-row items-center gap-3 p-4', selected && 'border-2 border-primary', className)}>
        <View className="flex-1">
          <Text className="text-base font-semibold text-foreground">{title}</Text>
          {subtitle ? <Text className="mt-0.5 text-sm text-muted-foreground">{subtitle}</Text> : null}
        </View>
        {selected ? (
          <View className="h-7 w-7 items-center justify-center rounded-full bg-primary">
            <Check size={16} color="#FFFFFF" />
          </View>
        ) : (
          <View className="h-7 w-7 rounded-full border-2 border-border" />
        )}
      </GlassSurface>
    </Pressable>
  );
}
