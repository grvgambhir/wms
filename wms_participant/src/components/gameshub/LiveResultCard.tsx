import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import type { MatchResult } from '@/domain/models/match';
import { useAppLayout } from '@/hooks/useAppLayout';
import { flagEmoji } from '@/lib/format';
import { cn } from '@/lib/utils';

type LiveResultCardProps = {
  match: MatchResult;
  className?: string;
};

const STATUS_LABELS = {
  scheduled: 'Scheduled',
  live: 'Live',
  completed: 'Final',
} as const;

/** Live/final scoreboard for A18 — sets, current game, optional stats. */
export function LiveResultCard({ match, className }: LiveResultCardProps) {
  const { isWideWeb } = useAppLayout();
  const [tab, setTab] = useState<'live' | number>('live');
  const isLive = match.status === 'live';
  const sets = match.sets ?? [];

  const visibleSet = typeof tab === 'number' ? sets[tab] : undefined;

  const statsBlock =
    tab === 'live' && match.stats?.length ? (
      <View className="gap-3">
        <Text className="text-sm font-bold text-foreground">{copy.liveMatchStats}</Text>
        {match.stats.map((stat) => {
          const total = stat.a + stat.b || 1;
          return (
            <View key={stat.label} className="gap-1">
              <View className="flex-row justify-between">
                <Text className="text-xs font-semibold text-foreground">{stat.a}</Text>
                <Text className="text-xs text-muted-foreground">{stat.label}</Text>
                <Text className="text-xs font-semibold text-foreground">{stat.b}</Text>
              </View>
              <View className="h-1.5 flex-row overflow-hidden rounded-full bg-slate-100">
                <View className="bg-primary" style={{ flex: stat.a / total }} />
                <View className="bg-slate-300" style={{ flex: stat.b / total }} />
              </View>
            </View>
          );
        })}
      </View>
    ) : null;

  const metaBlock = (
    <View className="flex-row gap-2">
      <View className="flex-1 rounded-xl bg-slate-50 px-3 py-2">
        <Text className="text-[10px] uppercase text-muted-foreground">{copy.liveMatchTime}</Text>
        <Text className="text-sm font-semibold text-foreground">{STATUS_LABELS[match.status]}</Text>
      </View>
      <View className="flex-1 rounded-xl bg-slate-50 px-3 py-2">
        <Text className="text-[10px] uppercase text-muted-foreground">{copy.liveMatchLastUpdate}</Text>
        <Text className="text-sm font-semibold text-foreground">
          {new Date(match.updatedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
        </Text>
      </View>
    </View>
  );

  return (
    <View className={cn('overflow-hidden rounded-2xl border border-border/60 bg-white', className)}>
      <View className={cn('gap-4 p-4', isWideWeb && 'flex-row items-start')}>
        <View className={cn('gap-4', isWideWeb && 'flex-1')}>
          <ScoreRow
            name={match.sideA.displayName}
            flags={match.sideA.countryCodes}
            serving={isLive && match.servingSide === 'a'}
            sets={sets.map((set) => set.a)}
            gamePoint={isLive ? match.gamePoints?.a : undefined}
          />
          <ScoreRow
            name={match.sideB.displayName}
            flags={match.sideB.countryCodes}
            serving={isLive && match.servingSide === 'b'}
            sets={sets.map((set) => set.b)}
            gamePoint={isLive ? match.gamePoints?.b : undefined}
          />

          <Text className="text-center text-sm font-semibold text-foreground">{match.scoreSummary}</Text>

          {sets.length > 0 ? (
            <View className="flex-row gap-2">
              <TabChip label={copy.liveMatchTabLive} selected={tab === 'live'} onPress={() => setTab('live')} />
              {sets.map((set, index) => (
                <TabChip
                  key={set.label}
                  label={set.label}
                  selected={tab === index}
                  onPress={() => setTab(index)}
                />
              ))}
            </View>
          ) : null}

          {visibleSet ? (
            <View className="rounded-xl bg-primary/5 px-4 py-3">
              <Text className="text-center text-sm font-semibold text-foreground">
                {visibleSet.label}: {visibleSet.a} – {visibleSet.b}
              </Text>
            </View>
          ) : null}

          {!isWideWeb ? statsBlock : null}
          {!isWideWeb ? metaBlock : null}
        </View>

        {isWideWeb ? (
          <View className="w-[36%] gap-4 border-l border-border/60 pl-4">
            {statsBlock}
            {metaBlock}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function ScoreRow({
  name,
  flags,
  serving,
  sets,
  gamePoint,
}: {
  name: string;
  flags?: string[];
  serving: boolean;
  sets: Array<number | string>;
  gamePoint?: string;
}) {
  return (
    <View className="flex-row items-center gap-2">
      <View className="w-2">
        {serving ? <View className="h-2 w-2 rounded-full bg-emerald-500" /> : null}
      </View>
      <View className="flex-1">
        <Text className="text-sm font-semibold text-foreground">{name}</Text>
        {flags?.length ? (
          <Text className="text-xs text-muted-foreground">{flags.map(flagEmoji).join(' ')}</Text>
        ) : null}
      </View>
      {sets.map((value, index) => (
        <View key={`${name}-set-${index}`} className="h-9 w-9 items-center justify-center rounded-lg bg-slate-100">
          <Text className="text-sm font-bold text-foreground">{value}</Text>
        </View>
      ))}
      {gamePoint != null ? (
        <View className="h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
          <Text className="text-sm font-bold text-primary">{gamePoint}</Text>
        </View>
      ) : null}
    </View>
  );
}

function TabChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={cn(
        'rounded-full px-3 py-1.5',
        selected ? 'bg-primary' : 'bg-slate-100',
      )}>
      <Text className={cn('text-xs font-semibold', selected ? 'text-white' : 'text-muted-foreground')}>{label}</Text>
    </Pressable>
  );
}