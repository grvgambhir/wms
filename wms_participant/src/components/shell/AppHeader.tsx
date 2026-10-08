import { ChevronLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

type AppHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backAccessibilityLabel?: string;
  className?: string;
};

/** Standard screen header with optional back action. */
export function AppHeader({ title, subtitle, onBack, backAccessibilityLabel = 'Go back', className }: AppHeaderProps) {
  return (
    <View className={cn('mb-4 flex-row items-center gap-3', className)}>
      {onBack ? (
        <Pressable
          onPress={onBack}
          className="h-11 w-11 min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-secondary active:opacity-80"
          accessibilityRole="button"
          accessibilityLabel={backAccessibilityLabel}>
          <ChevronLeft size={22} className="text-foreground" color="#0F172A" />
        </Pressable>
      ) : null}
      <View className="flex-1">
        {title ? <Text accessibilityRole="header" className="text-xl font-bold text-foreground">{title}</Text> : null}
        {subtitle ? <Text className="mt-0.5 text-sm text-muted-foreground">{subtitle}</Text> : null}
      </View>
    </View>
  );
}
