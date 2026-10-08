// P — the participant's Games-time schedule. Grouped by day so an athlete can see
// "what am I doing tomorrow" at a glance, which is the question this screen exists to
// answer; each entry carries its venue and court because that is what they travel to.
import { CalendarDays, MapPin } from 'lucide-react-native';
import { View } from 'react-native';

import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import type { ScheduleItem } from '@/domain/models/gameshub';
import { useMyGames, type ScheduledEntry } from '@/features/gameshub/hooks/useMyGames';
import { useCopy, type CopyDict } from '@/i18n';
import { formatCompactDate } from '@/lib/format';
import { colors } from '@/theme/colors';

function typeLabel(copy: CopyDict, type: ScheduleItem['type']): string {
  switch (type) {
    case 'match':
      return copy.gamesTypeMatch;
    case 'training':
      return copy.gamesTypeTraining;
    case 'ceremony':
      return copy.gamesTypeCeremony;
    case 'social':
      return copy.gamesTypeSocial;
    default:
      return copy.gamesTypeOther;
  }
}

/** HH:MM in the venue's local reading — the seed is already local-time ISO. */
function timeOf(iso: string): string {
  return iso.slice(11, 16);
}

function EntryRow({ entry, copy }: { entry: ScheduledEntry; copy: CopyDict }) {
  const where = entry.venue
    ? `${entry.venue.name}, ${entry.venue.city}${entry.court ? ` · ${entry.court}` : ''}`
    : '';
  const when = `${timeOf(entry.startAt)}${entry.endAt ? `–${timeOf(entry.endAt)}` : ''}`;
  const spoken = `${typeLabel(copy, entry.type)}. ${entry.title}. ${when}. ${where}`;

  return (
    <View
      className="rounded-2xl border border-border bg-card p-4"
      accessible
      accessibilityRole="text"
      accessibilityLabel={spoken}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
        <View className="flex-row items-start justify-between gap-3">
          <View className="flex-1">
            <Text className="text-[11px] font-semibold uppercase tracking-wide text-primary">
              {typeLabel(copy, entry.type)}
            </Text>
            <Text className="mt-0.5 text-[15px] font-bold text-foreground">{entry.title}</Text>
            {where ? (
              <View className="mt-1.5 flex-row items-center gap-1.5">
                <MapPin size={13} color={colors.textMuted} />
                <Text className="flex-1 text-[12px] text-muted-foreground">{where}</Text>
              </View>
            ) : null}
          </View>
          <Text className="text-[13px] font-semibold text-foreground">{when}</Text>
        </View>
      </View>
    </View>
  );
}

export default function MyGamesScreen() {
  const copy = useCopy();
  const { data, isLoading } = useMyGames();

  if (isLoading) {
    return (
      <ParticipantPortalShell activeId="games">
        <LoadingState message={copy.gamesTitle} />
      </ParticipantPortalShell>
    );
  }

  const entries = data ?? [];
  // Group by calendar day; the seed is ordered, so insertion order is chronological.
  const byDay = entries.reduce<Record<string, ScheduledEntry[]>>((acc, entry) => {
    const day = entry.startAt.slice(0, 10);
    (acc[day] ??= []).push(entry);
    return acc;
  }, {});
  const venues = [...new Map(entries.filter((e) => e.venue).map((e) => [e.venue!.id, e.venue!])).values()];

  return (
    <ParticipantPortalShell activeId="games">
      <View className="gap-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
            {copy.gamesTitle}
          </Text>
          <Text className="text-[13px] text-muted-foreground">{copy.gamesSubtitle}</Text>
        </View>

        {entries.length === 0 ? (
          <View className="rounded-2xl border border-border bg-card p-5">
            <Text accessibilityRole="header" className="text-base font-bold text-foreground">
              {copy.gamesEmpty}
            </Text>
            <Text className="mt-1 text-[13px] text-muted-foreground">{copy.gamesEmptyBody}</Text>
          </View>
        ) : (
          <View className="gap-4">
            {Object.entries(byDay).map(([day, items]) => (
              <View key={day} className="gap-2.5">
                <View className="flex-row items-center gap-2">
                  <CalendarDays size={14} color={colors.textMuted} />
                  <Text accessibilityRole="header" className="text-[12px] font-bold uppercase tracking-wide text-muted-foreground">
                    {formatCompactDate(day)}
                  </Text>
                </View>
                {items.map((entry) => (
                  <EntryRow key={entry.id} entry={entry} copy={copy} />
                ))}
              </View>
            ))}
          </View>
        )}

        {venues.length > 0 ? (
          <View className="mt-1 rounded-2xl border border-border bg-card p-5">
            <Text accessibilityRole="header" className="text-base font-bold text-foreground">
              {copy.gamesVenuesHeading}
            </Text>
            <View className="mt-2">
              {venues.map((venue) => (
                <View
                  key={venue.id}
                  className="border-b border-border/60 py-2.5"
                  accessible
                  accessibilityRole="text"
                  accessibilityLabel={`${venue.name}, ${venue.city}. ${venue.address ?? ''}`}
                >
                  <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
                    <Text className="text-[13px] font-semibold text-foreground">{venue.name}</Text>
                    <Text className="text-[12px] text-muted-foreground">{venue.address ?? venue.city}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>
        ) : null}
      </View>
    </ParticipantPortalShell>
  );
}
