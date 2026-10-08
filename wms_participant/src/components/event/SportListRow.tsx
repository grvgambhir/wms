import { ChevronRight } from 'lucide-react-native';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import type { QuotaStatus } from '@/components/registration/QuotaBadge';
import { getSportVisualMeta } from '@/features/events/utils/sportPresentation';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

const STATUS_TEXT: Record<QuotaStatus, { label: string; className: string }> = {
  available: { label: copy.sportStatusAvailable, className: 'text-emerald-600' },
  almost_full: { label: copy.sportStatusAlmostFull, className: 'text-amber-600' },
  full: { label: copy.quotaFull, className: 'text-red-600' },
  waitlist: { label: copy.quotaWaitlist, className: 'text-sky-600' },
  closed: { label: copy.registrationClosed, className: 'text-muted-foreground' },
};

type SportListRowProps = {
  name: string;
  iconKey?: string;
  availability: QuotaStatus;
  onPress?: () => void;
};

/** A05 sport list row — colored icon, subtitle, availability, chevron. */
export function SportListRow({ name, iconKey, availability, onPress }: SportListRowProps) {
  const meta = getSportVisualMeta(iconKey, name);
  const status = STATUS_TEXT[availability];

  const content = (
    <View className="flex-row items-center gap-3 border-b border-border/50 py-4">
      <View
        className="h-12 w-12 items-center justify-center rounded-full"
        style={{ backgroundColor: meta.color }}>
        <Text className="text-lg font-bold text-white">{name.slice(0, 1)}</Text>
      </View>
      <View className="flex-1 gap-0.5">
        <Text className="text-base font-semibold text-foreground">{name}</Text>
        <Text className="text-sm text-muted-foreground">{meta.subtitle}</Text>
      </View>
      <Text className={cn('text-xs font-semibold', status.className)}>{status.label}</Text>
      <ChevronRight size={18} color={colors.textMuted} />
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={onPress} className="rounded-xl px-1 hover:bg-primary/5 active:opacity-80">
        {content}
      </Pressable>
    );
  }

  return content;
}
