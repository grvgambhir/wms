import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, type PressableProps } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { gradients } from '@/theme/gradients';

type GradientButtonProps = PressableProps & {
  children: React.ReactNode;
  className?: string;
  textClassName?: string;
  size?: 'default' | 'lg';
};

/** Premium primary CTA with World Masters Sport gradient fill. */
export function GradientButton({
  children,
  className,
  textClassName,
  size = 'lg',
  disabled,
  accessibilityLabel,
  ...props
}: GradientButtonProps) {
  const height = size === 'lg' ? 52 : 44;
  const resolvedLabel = accessibilityLabel ?? (typeof children === 'string' ? children : undefined);

  return (
    <Pressable
      className={cn('overflow-hidden rounded-xl active:opacity-90', disabled && 'opacity-50', className)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={resolvedLabel}
      accessibilityState={{ disabled: !!disabled }}
      {...props}>
      <LinearGradient
        colors={[...gradients.cta]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={{
          minHeight: height,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24,
          borderRadius: 12,
        }}>
        {typeof children === 'string' ? (
          <Text className={cn('text-base font-semibold text-white', textClassName)}>{children}</Text>
        ) : (
          children
        )}
      </LinearGradient>
    </Pressable>
  );
}
