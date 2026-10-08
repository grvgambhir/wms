import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';

type EventInfoRowProps = {
  icon: React.ReactNode;
  label: string;
  value: string;
  onPress?: () => void;
  valueClassName?: string;
};

/** A04 icon row for deadline, age group, venues, website. */
export function EventInfoRow({ icon, label, value, onPress, valueClassName }: EventInfoRowProps) {
  const content = (
    <View className="flex-row items-center gap-3 py-3">
      <View className="w-6 items-center">{icon}</View>
      <Text className="flex-1 text-sm font-medium text-foreground">{label}</Text>
      <Text className={valueClassName ?? 'text-sm font-semibold text-foreground'}>{value}</Text>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-80">
        {content}
      </Pressable>
    );
  }

  return content;
}
