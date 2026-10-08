import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, Share2 } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WmsMark } from '@/components/brand/WmsMark';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { resolveAsset } from '@/theme/assets';
import { cn } from '@/lib/utils';
import { gradients } from '@/theme/gradients';

type EventDetailHeroProps = {
  title: string;
  imageKey?: string;
  onBack: () => void;
  /** Rounded card inside centered layout (wide web two-column). */
  contained?: boolean;
};

/** A04 full-bleed hero with floating back/share controls and World Masters Sport mark overlap. */
export function EventDetailHero({ title, imageKey, onBack, contained = false }: EventDetailHeroProps) {
  const insets = useSafeAreaInsets();
  const heroImage = resolveAsset(imageKey);

  return (
    <View className={cn('relative mb-2', contained ? 'rounded-2xl' : '-mx-4')}>
      <View className={cn('relative overflow-hidden', contained ? 'h-[320px] rounded-2xl' : 'h-[240px]')}>
        {heroImage ? (
          <Image source={heroImage} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <LinearGradient colors={[...gradients.hero]} style={{ flex: 1 }} />
        )}
        <LinearGradient
          colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.15)']}
          style={{ position: 'absolute', inset: 0 }}
        />

        <View
          className="absolute left-0 right-0 flex-row items-center justify-between px-4"
          style={{ top: Math.max(insets.top, 12) }}>
          <Pressable
            onPress={onBack}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/25 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Go back">
            <ArrowLeft size={20} color="#FFFFFF" />
          </Pressable>
          <Pressable
            onPress={() => Alert.alert(copy.eventDetailsShare, copy.eventDetailsShareStub)}
            className="h-10 w-10 items-center justify-center rounded-full bg-black/25 active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Share event">
            <Share2 size={18} color="#FFFFFF" />
          </Pressable>
        </View>
      </View>

      <View className="absolute -bottom-6 left-0 right-0 items-center">
        <View className="rounded-xl bg-slate-950 px-3 py-2 shadow-lg">
          <WmsMark size="md" />
        </View>
      </View>

      <Text className="sr-only">{title}</Text>
    </View>
  );
}
