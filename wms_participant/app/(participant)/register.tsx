// Register for a sport — the first step that creates a real entry (`POST /v1/me/entries`).
// Before this screen existed, "registering" re-pointed one demo athlete's existing entry at a
// new sport for whoever was signed in.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import type { RegistrationOptionProduct } from '@/domain/models/myEntries';
import type { EntryGrade } from '@/domain/models/registrationJourney';
import { createEntryOutcome, nextStepFor } from '@/features/registration/myEntriesView';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { useCreateEntry, useRegistrationOptions } from '@/features/registration/hooks/useMyEntries';
import { useCopy, type CopyDict } from '@/i18n';
import { colors } from '@/theme/colors';

export default function RegisterScreen() {
  const router = useRouter();
  const copy = useCopy();
  const journey = useRegistrationJourney();
  const options = useRegistrationOptions();
  const createEntry = useCreateEntry();
  const [pendingProductId, setPendingProductId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, { message: string; toProfile: boolean }>>({});

  const openAndGo = async (entryId: string, status = 'draft') => {
    await journey.openEntry(entryId);
    router.push(nextStepFor(status).route);
  };

  const start = async (product: RegistrationOptionProduct, grade: EntryGrade) => {
    setPendingProductId(product.id);
    setErrors((current) => ({ ...current, [product.id]: undefined as never }));
    try {
      const entry = await createEntry.mutateAsync({ sportEntryProductId: product.id, grade });
      await journey.openEntry(entry.id);
      if (product.participantType === 'doubles') {
        router.push('/partner-finder');
      } else if (product.participantType === 'team' || product.participantType === 'crew' || product.participantType === 'relay') {
        router.push('/team-roster');
      } else {
        router.push(nextStepFor(entry.status).route);
      }
    } catch (caught) {
      const outcome = createEntryOutcome(caught, copy);
      if (outcome.kind === 'open_existing') {
        await openAndGo(outcome.entryId);
        return;
      }
      setErrors((current) => ({
        ...current,
        [product.id]: { message: outcome.message, toProfile: outcome.kind === 'go_profile' },
      }));
    } finally {
      setPendingProductId(null);
    }
  };

  const body = () => {
    if (options.isLoading) return <LoadingState message={copy.registerLoading} />;
    if (options.isError || !options.data) {
      return <ErrorState description={options.error?.message} onRetry={() => void options.refetch()} />;
    }
    const { event, products } = options.data;
    if (!event) return <Text style={{ color: colors.textMuted }}>{copy.registerNoEvent}</Text>;
    return (
      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.text, fontWeight: '800' }}>{event.name}</Text>
        {!event.registrationOpen ? <Text style={{ color: colors.danger }}>{copy.registerClosed}</Text> : null}
        {products.map((product) => (
          <ProductCard
            key={product.id}
            product={product}
            copy={copy}
            disabled={!event.registrationOpen || pendingProductId !== null}
            pending={pendingProductId === product.id}
            error={errors[product.id]}
            onStart={(grade) => void start(product, grade)}
            onOpenExisting={() => void openAndGo(product.myEntryId!)}
            onProfile={() => router.push('/profile')}
          />
        ))}
      </View>
    );
  };

  return (
    <ParticipantPortalShell activeId="entries">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.registerBreadcrumb}</Text>
      <Text accessibilityRole="header" style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 6 }}>
        {copy.registerTitle}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 20 }}>{copy.registerSubtitle}</Text>
      {body()}
    </ParticipantPortalShell>
  );
}

function ProductCard({
  product,
  copy,
  disabled,
  pending,
  error,
  onStart,
  onOpenExisting,
  onProfile,
}: {
  product: RegistrationOptionProduct;
  copy: CopyDict;
  disabled: boolean;
  pending: boolean;
  error?: { message: string; toProfile: boolean };
  onStart: (grade: EntryGrade) => void;
  onOpenExisting: () => void;
  onProfile: () => void;
}) {
  const [grade, setGrade] = useState<EntryGrade>(product.allowedGrades[0] ?? 'competitive');
  const notEligible = product.category !== null && !product.category.eligible;
  const categoryLine =
    product.category === null
      ? copy.registerCategoryLater
      : product.category.name
        ? copy.registerYourCategory.replace('{category}', product.category.name)
        : copy.registerNotEligible;

  return (
    <View style={card}>
      <Text style={{ color: colors.primary, fontSize: 11, fontWeight: '800', textTransform: 'uppercase' }}>{product.sportName}</Text>
      <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 16, fontWeight: '800', marginTop: 2 }}>{product.name}</Text>
      <Text style={{ color: notEligible ? colors.danger : colors.textMuted, fontSize: 13, marginTop: 4 }}>{categoryLine}</Text>

      {product.myEntryId ? (
        <Pressable accessibilityRole="button" onPress={onOpenExisting} style={secondaryButton}>
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.registerOpenExisting}</Text>
        </Pressable>
      ) : (
        <>
          {product.allowedGrades.length > 1 ? (
            <View style={{ marginTop: 12, gap: 6 }}>
              <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{copy.registerGrade}</Text>
              <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                {product.allowedGrades.map((option) => {
                  const active = option === grade;
                  return (
                    <Pressable
                      key={option}
                      accessibilityRole="radio"
                      accessibilityState={{ checked: active }}
                      onPress={() => setGrade(option)}
                      style={{
                        borderWidth: 1,
                        borderColor: active ? colors.primary : colors.border,
                        borderRadius: 10,
                        paddingHorizontal: 12,
                        paddingVertical: 8,
                      }}
                    >
                      <Text style={{ color: active ? colors.primary : colors.text, fontWeight: active ? '800' : '600' }}>
                        {option === 'competitive' ? copy.categoryEntryCompetitive : copy.categoryEntryRecreational}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${copy.registerStart}: ${product.sportName} ${product.name}`}
            disabled={disabled}
            accessibilityState={{ disabled }}
            onPress={() => onStart(grade)}
            style={{ ...primaryButton, opacity: disabled ? 0.55 : 1 }}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>
              {pending ? copy.registerStarting : copy.registerStart}
            </Text>
          </Pressable>
        </>
      )}

      {error ? (
        <View style={{ marginTop: 10, gap: 6 }}>
          <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13 }}>{error.message}</Text>
          {error.toProfile ? (
            <Pressable accessibilityRole="link" onPress={onProfile}>
              <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 13 }}>{copy.registerGoToProfile}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const card = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  borderRadius: 14,
  padding: 18,
} as const;

const primaryButton = {
  marginTop: 14,
  minHeight: 44,
  borderRadius: 10,
  backgroundColor: colors.primary,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 16,
} as const;

const secondaryButton = {
  marginTop: 14,
  minHeight: 44,
  borderRadius: 10,
  borderWidth: 1,
  borderColor: colors.primary,
  alignItems: 'center',
  justifyContent: 'center',
  paddingHorizontal: 16,
} as const;
