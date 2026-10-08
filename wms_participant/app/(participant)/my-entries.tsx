// My Entries — every registration the signed-in person has, each with its next step.
// This used to route straight to one hard-coded demo entry; it is now the person's own list
// (`GET /v1/me/entries`), and an empty list is a normal state, not an error.
import { ChevronRight, Plus } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';

import { EmptyState } from '@/components/shell/EmptyState';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import type { MyEntry } from '@/domain/models/myEntries';
import type { JourneyEntryStatus } from '@/domain/models/registrationJourney';
import { nextStepFor } from '@/features/registration/myEntriesView';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { useMyEntries } from '@/features/registration/hooks/useMyEntries';
import { statusLabel } from '@/features/registration/statusLabels';
import { useCopy } from '@/i18n';
import { colors } from '@/theme/colors';

export default function MyEntriesScreen() {
  const router = useRouter();
  const copy = useCopy();
  const journey = useRegistrationJourney();
  const entries = useMyEntries();

  const open = async (entry: MyEntry) => {
    await journey.openEntry(entry.id);
    router.push(nextStepFor(entry.status).route);
  };

  const registerButton = (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push('/register')}
      style={primaryButton}
    >
      <Plus size={16} color={colors.primaryForeground} />
      <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{copy.myEntriesRegisterCta}</Text>
    </Pressable>
  );

  return (
    <ParticipantPortalShell activeId="entries">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.myEntriesBreadcrumb}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 12, marginTop: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        <View style={{ flex: 1, minWidth: 240 }}>
          <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: colors.text }}>
            {copy.myEntriesTitle}
          </Text>
          <Text style={{ color: colors.textMuted, marginTop: 4 }}>{copy.myEntriesSubtitle}</Text>
        </View>
        {entries.data && entries.data.items.length > 0 ? registerButton : null}
      </View>

      {entries.isLoading ? (
        <LoadingState message={copy.myEntriesLoading} />
      ) : entries.isError ? (
        <ErrorState description={entries.error?.message} onRetry={() => void entries.refetch()} />
      ) : !entries.data || entries.data.items.length === 0 ? (
        <EmptyState tone="folder" title={copy.myEntriesEmptyTitle} description={copy.myEntriesEmptyBody} action={registerButton} />
      ) : (
        <View style={{ gap: 12 }}>
          {entries.data.items.map((entry) => {
            const step = nextStepFor(entry.status);
            const status = statusLabel(copy, entry.status as JourneyEntryStatus);
            return (
              <Pressable
                key={entry.id}
                accessibilityRole="button"
                accessibilityLabel={`${entry.sportName} ${entry.productName}. ${status}. ${copy[step.labelKey]}`}
                onPress={() => void open(entry)}
                style={card}
              >
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>
                    {entry.sportName}
                  </Text>
                  <Text style={{ color: colors.text, fontSize: 16, fontWeight: '800' }}>{entry.productName}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                    {copy.myEntriesCategory}: {entry.categoryName ?? copy.myEntriesCategoryPending}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 8 }}>
                  <Text style={badge}>{status}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{copy[step.labelKey]}</Text>
                    <ChevronRight size={16} color={colors.primary} />
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      )}
    </ParticipantPortalShell>
  );
}

const card = {
  flexDirection: 'row',
  alignItems: 'center',
  gap: 12,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  borderRadius: 14,
  padding: 18,
} as const;

const badge = {
  color: colors.primary,
  fontSize: 12,
  fontWeight: '800',
  backgroundColor: 'rgba(72,135,202,0.10)',
  borderRadius: 999,
  paddingHorizontal: 10,
  paddingVertical: 4,
  overflow: 'hidden',
} as const;

const primaryButton = {
  minHeight: 44,
  borderRadius: 10,
  backgroundColor: colors.primary,
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  paddingHorizontal: 16,
} as const;
