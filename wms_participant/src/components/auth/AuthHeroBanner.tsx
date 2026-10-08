import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { View } from 'react-native';

import { WmsMark } from '@/components/brand/WmsMark';
import { Text } from '@/components/ui/text';
import { useCopy } from '@/i18n';
import { cn } from '@/lib/utils';
import { resolveAsset } from '@/theme/assets';

type AuthHeroBannerProps = {
  /** Bundled asset key — mockup uses Como Lake hero on A01. */
  imageKey?: 'omgComoLake2027Hero' | 'wmgKansai2027Hero';
  title?: string;
  subtitle?: string;
  className?: string;
};

/** A01 hero — scenic event photo with World Masters Sport mark overlay. */
export function AuthHeroBanner({
  imageKey = 'omgComoLake2027Hero',
  title,
  subtitle,
  className,
}: AuthHeroBannerProps) {
  const copy = useCopy();
  const source = resolveAsset(imageKey);

  return (
    <View className={cn('relative h-[280px] w-full overflow-hidden', className)}>
      {source ? (
        <Image source={source} contentFit="cover" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
      ) : null}
      <LinearGradient
        colors={['rgba(0,0,0,0.25)', 'rgba(0,0,0,0.72)']}
        style={{ position: 'absolute', inset: 0 }}
      />
      <View className="flex-1 items-center justify-end px-4 pb-10 pt-12">
        <View accessibilityElementsHidden importantForAccessibility="no">
          <WmsMark size="lg" />
        </View>
        <View className="mt-3 items-center gap-1">
          <Text accessibilityRole="header" className="text-center text-xs font-bold uppercase tracking-[3px] text-white/90">{title ?? copy.loginHeroTitle}</Text>
          <Text accessibilityRole="header" className="text-center text-lg font-bold uppercase tracking-[2px] text-white">{subtitle ?? copy.loginHeroSubtitle}</Text>
        </View>
      </View>
    </View>
  );
}
