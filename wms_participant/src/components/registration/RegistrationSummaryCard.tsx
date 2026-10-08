import { Pressable, View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

export type SummaryRow = {
  label: string;
  value: string;
};

type RegistrationSummaryCardProps = {
  title: string;
  rows: SummaryRow[];
  className?: string;
  /** Optional edit control (A13 mockup pencil). */
  onEdit?: () => void;
  editLabel?: string;
};

/** Review/payment summary block for A13–A14. */
export function RegistrationSummaryCard({
  title,
  rows,
  className,
  onEdit,
  editLabel,
}: RegistrationSummaryCardProps) {
  return (
    <GlassSurface className={cn('gap-3 p-4', className)}>
      <View className="flex-row items-center justify-between gap-2">
        <Text className="text-sm font-bold text-foreground">{title}</Text>
        {onEdit ? (
          <Pressable onPress={onEdit} className="active:opacity-70 hover:opacity-80">
            <Text className="text-sm font-semibold text-primary">{editLabel ?? 'Edit'}</Text>
          </Pressable>
        ) : null}
      </View>
      {rows.map((row, index) => (
        <View key={`${row.label}-${index}`}>
          {index > 0 ? <Separator className="mb-3" /> : null}
          <View className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 text-sm text-muted-foreground">{row.label}</Text>
            <Text className="max-w-[58%] text-right text-sm font-semibold text-foreground">{row.value}</Text>
          </View>
        </View>
      ))}
    </GlassSurface>
  );
}
