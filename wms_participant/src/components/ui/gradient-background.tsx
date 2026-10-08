import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';

import { gradients } from '@/theme/gradients';

type GradientBackgroundProps = {
  children?: React.ReactNode;
};

/** Soft atmospheric screen background with gradient mesh and accent orbs. */
export function GradientBackground({ children }: GradientBackgroundProps) {
  return (
    <View className="absolute inset-0">
      <LinearGradient
        colors={[...gradients.screen]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        className="absolute -right-16 top-24 h-56 w-56 rounded-full"
        style={{ backgroundColor: gradients.orbPrimary }}
      />
      <View
        className="absolute -left-20 bottom-40 h-48 w-48 rounded-full"
        style={{ backgroundColor: gradients.orbAccent }}
      />
      {children}
    </View>
  );
}
