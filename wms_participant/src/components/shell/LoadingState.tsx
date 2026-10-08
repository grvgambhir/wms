import { ActivityIndicator, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useCopy } from '@/i18n';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type LoadingStateProps = {
  message?: string;
  className?: string;
};

export function LoadingState({ message, className }: LoadingStateProps) {
  const copy = useCopy();
  return (
    <View className={cn('items-center justify-center gap-3 py-12', className)}>
      <ActivityIndicator size="large" color={colors.primary} />
      <Text className="text-sm text-muted-foreground">{message ?? copy.loading}</Text>
    </View>
  );
}
