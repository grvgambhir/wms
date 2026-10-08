import { LinearGradient } from 'expo-linear-gradient';
import { ChevronRight, IdCard } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { gradients } from '@/theme/gradients';

type DigitalPassShortcutProps = {
  onPress?: () => void;
};

/** GamesHub shortcut to A16 — premium pass entry (mockup: digital pass row). */
export function DigitalPassShortcut({ onPress }: DigitalPassShortcutProps) {
  const content = (
    <View className="overflow-hidden rounded-2xl">
      <LinearGradient
        colors={[...gradients.cta]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={{ padding: 16 }}>
        <View className="flex-row items-center gap-3">
          <View className="rounded-xl bg-white/20 p-3">
            <IdCard size={22} color="#FFFFFF" />
          </View>
          <View className="flex-1">
            <Text className="text-base font-bold text-white">{copy.gamesHubDigitalPass}</Text>
            <Text className="mt-0.5 text-sm text-white/85">{copy.gamesHubDigitalPassHint}</Text>
          </View>
          <ChevronRight size={20} color="#FFFFFF" />
        </View>
      </LinearGradient>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="active:opacity-90">
        {content}
      </Pressable>
    );
  }

  return content;
}
