import { View } from 'react-native';

import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useCopy } from '@/i18n';
import { cn } from '@/lib/utils';

type ErrorStateProps = {
  title?: string;
  description?: string;
  onRetry?: () => void;
  className?: string;
};

export function ErrorState({
  title,
  description,
  onRetry,
  className,
}: ErrorStateProps) {
  const copy = useCopy();
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      className={cn('items-center justify-center rounded-2xl border border-destructive/20 bg-red-50 px-6 py-8', className)}>
      <Text className="text-center text-base font-semibold text-destructive">{title ?? copy.errorSomethingWentWrong}</Text>
      <Text className="mt-2 text-center text-sm text-muted-foreground">{description ?? copy.errorPleaseTryAgain}</Text>
      {onRetry ? (
        <Button variant="outline" className="mt-4" accessibilityLabel={copy.errorTryAgain} onPress={onRetry}>
          <Text>{copy.errorTryAgain}</Text>
        </Button>
      ) : null}
    </View>
  );
}
