import { CalendarDays, FolderOpen, Inbox, Lock, Search, type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

export type EmptyStateTone = 'search' | 'calendar' | 'lock' | 'inbox' | 'folder';

type EmptyStateProps = {
  title: string;
  description?: string;
  /** Visual cue so search-empty vs locked vs inbox do not all look the same. */
  tone?: EmptyStateTone;
  action?: ReactNode;
  className?: string;
};

const TONE_ICON: Record<EmptyStateTone, LucideIcon> = {
  search: Search,
  calendar: CalendarDays,
  lock: Lock,
  inbox: Inbox,
  folder: FolderOpen,
};

/** Centered empty placeholder — dashed card, optional supporting hint and CTA. */
export function EmptyState({ title, description, tone = 'search', action, className }: EmptyStateProps) {
  const Icon = TONE_ICON[tone];

  return (
    <View
      className={cn(
        'items-center justify-center rounded-2xl border border-dashed border-border bg-card px-6 py-10 lg:py-14',
        className,
      )}>
      <View className="mb-3 h-12 w-12 items-center justify-center rounded-full bg-primary/10">
        <Icon size={22} color={colors.primary} />
      </View>
      <Text accessibilityRole="header" className="text-center text-base font-semibold text-foreground lg:text-lg">{title}</Text>
      {description ? (
        <Text className="mt-2 max-w-md text-center text-sm leading-5 text-muted-foreground">{description}</Text>
      ) : null}
      {action ? <View className="mt-5 w-full max-w-[240px] self-center">{action}</View> : null}
    </View>
  );
}
