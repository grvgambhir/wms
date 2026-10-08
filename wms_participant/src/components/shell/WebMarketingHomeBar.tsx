import { ChevronLeft } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { SCREEN_GUTTER_COMPACT, SCREEN_GUTTER_WIDE } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { openWorldMastersHome } from '@/lib/webMarketingHome';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

/** TEMPORARY POC (REV-010): web-only exit back to the World Masters snapshot. */
export function WebMarketingHomeBar() {
  const { isWideWeb } = useAppLayout();

  return (
    <View className="shrink-0 border-b border-border bg-white">
      <Pressable
        onPress={openWorldMastersHome}
        accessibilityRole="link"
        accessibilityLabel={copy.webMarketingHomeA11y}
        className={cn(
          'flex-row items-center gap-1 py-2 active:opacity-70',
          isWideWeb ? SCREEN_GUTTER_WIDE : SCREEN_GUTTER_COMPACT,
        )}>
        <ChevronLeft size={16} color={colors.textMuted} />
        <Text className="text-xs font-medium text-muted-foreground">{copy.webMarketingHome}</Text>
      </Pressable>
    </View>
  );
}
