import { Image } from 'expo-image';
import { View } from 'react-native';

import { cn } from '@/lib/utils';
import { resolveAsset } from '@/theme/assets';

type WmsMarkProps = {
  size?: 'sm' | 'md' | 'lg';
  className?: string;
};

const SIZES = {
  sm: { width: 148, height: 56 },
  md: { width: 200, height: 76 },
  lg: { width: 240, height: 91 },
} as const;

/** Official World Masters Sport wordmark — replaces the old POC IMGA circle everywhere. */
export function WmsMark({ size = 'md', className }: WmsMarkProps) {
  const logo = resolveAsset('wmsLogoLandscape');
  const dimensions = SIZES[size];

  if (!logo) return null;

  return (
    <View className={cn('items-center justify-center', className)}>
      <Image source={logo} style={dimensions} contentFit="contain" />
    </View>
  );
}
