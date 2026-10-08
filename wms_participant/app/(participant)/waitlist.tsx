import { AlertTriangle, CheckCircle2, Clock, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { NoEntryState } from '@/features/registration/components/NoEntryState';
import { Text } from '@/components/ui/text';
import { useRegistrationJourney } from '@/features/registration/RegistrationJourneyContext';
import { useCopy } from '@/i18n';
import { formatMoneyMinor } from '@/lib/format';
import { colors } from '@/theme/colors';

function secondsUntil(iso?: string): number {
  if (!iso) return 0;
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 1000));
}

function mmss(total: number): string {
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

export default function WaitlistScreen() {
  const router = useRouter();
  const journey = useRegistrationJourney();
  const copy = useCopy();
  const [secondsLeft, setSecondsLeft] = useState(0);
  const expirySent = useRef(false);

  const waitlist = journey.snapshot?.waitlist;
  useEffect(() => {
    if (waitlist?.status !== 'offered') {
      setSecondsLeft(0);
      expirySent.current = false;
      return;
    }
    const update = () => setSecondsLeft(secondsUntil(waitlist.offerExpiresAt));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [waitlist?.offerExpiresAt, waitlist?.status]);

  useEffect(() => {
    if (
      waitlist?.status !== 'offered' ||
      secondsLeft > 0 ||
      secondsUntil(waitlist.offerExpiresAt) > 0 ||
      expirySent.current
    ) return;
    expirySent.current = true;
    // Expiring the offer is an OC/system action (`expire-offer` is correctly staff-only — a
    // participant's own tab has no business releasing a reservation, its own or anyone
    // else's), so this local countdown hitting zero cannot mutate anything itself. It just
    // asks for the current truth, which by then is whatever the OC screen has done.
    void journey.retry();
  }, [journey, secondsLeft, waitlist?.status]);

  if (journey.isLoading) {
    return (
      <ParticipantPortalShell activeId="entries">
        <LoadingState message={copy.waitlistLoading} />
      </ParticipantPortalShell>
    );
  }

  if (journey.needsEntry) {
    return (
      <ParticipantPortalShell activeId="entries">
        <NoEntryState />
      </ParticipantPortalShell>
    );
  }

  if (journey.isError || !journey.snapshot || !waitlist) {
    return (
      <ParticipantPortalShell activeId="entries">
        <ErrorState description={journey.error?.message ?? copy.waitlistUnavailable} onRetry={journey.retry} />
      </ParticipantPortalShell>
    );
  }

  const { snapshot, selectedFee, selectedProduct, selectedQuota, selectedSport } = journey;

  const run = async (action: 'join' | 'back' | 'claim') => {
    try {
      if (action === 'join' || action === 'back') await journey.joinWaitlist();
      if (action === 'claim') {
        await journey.claimWaitlistOffer();
        router.push('/checkout');
      }
    } catch {
      // The normalized mutation error is rendered below.
    }
  };

  return (
    <ParticipantPortalShell activeId="entries">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.waitlistBreadcrumb}</Text>
      <Text style={{ fontSize: 28, fontWeight: '800', color: colors.text, marginTop: 6 }}>
        {selectedSport?.name} · {selectedProduct?.name}
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 20 }}>
        {copy.waitlistSubtitle}
      </Text>

      <View style={{ maxWidth: 680, gap: 16 }}>
        <View style={{ ...card, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Users size={21} color={colors.danger} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontWeight: '800' }}>
              {copy.waitlistCapacityLine
                .replace('{confirmed}', String(selectedQuota?.confirmed ?? 0))
                .replace('{capacity}', String(selectedQuota?.capacity ?? 0))
                .replace(
                  '{status}',
                  selectedQuota?.status === 'full'
                    ? copy.waitlistStatusFull
                    : selectedQuota?.status === 'reserved'
                      ? copy.waitlistStatusReserved
                      : copy.sportEntryQuotaAvailable,
                )}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
              {copy.waitlistOversell}
            </Text>
          </View>
        </View>

        <View style={card}>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>{copy.waitlistCarriedFrom}</Text>
          <Text style={{ color: colors.text, fontWeight: '800', marginTop: 4 }}>
            {snapshot.entry.currentCategoryName} · {snapshot.entry.grade === 'competitive' ? copy.categoryEntryCompetitive : copy.categoryEntryRecreational}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 3 }}>
            {copy.waitlistRuleLine
              .replace('{fee}', selectedFee ? formatMoneyMinor(selectedFee.baseAmountMinor, selectedFee.currency) : '—')
              .replace('{version}', snapshot.entry.ruleVersion)}
          </Text>
        </View>

        {waitlist.status === 'eligible' ? (
          <View style={{ ...card, gap: 12 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 17 }}>{copy.waitlistCategoryFull}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {copy.waitlistJoinHint}
            </Text>
            <ActionButton disabled={journey.isActionPending} onPress={() => void run('join')} label={journey.isActionPending ? copy.waitlistJoining : copy.waitlistJoin} primary />
          </View>
        ) : null}

        {waitlist.status === 'waiting' ? (
          <View style={{ ...card, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <Clock size={19} color={colors.primary} />
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 16 }}>
                {copy.waitlistOnList.replace('{position}', String(waitlist.position))}
              </Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {copy.waitlistNotify}
            </Text>
          </View>
        ) : null}

        {waitlist.status === 'offered' ? (
          <View style={{ ...card, borderColor: colors.primary, backgroundColor: 'rgba(72,135,202,0.06)', gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <CheckCircle2 size={21} color={colors.primary} />
              <Text style={{ color: colors.primaryDark, fontWeight: '900', fontSize: 17 }}>{copy.waitlistPlaceReserved}</Text>
            </View>
            <Text accessibilityLiveRegion="polite" style={{ color: colors.text, fontWeight: '800' }}>
              {copy.waitlistOfferExpires.replace('{time}', mmss(secondsLeft))}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {copy.waitlistClaimHint}
            </Text>
            <ActionButton disabled={journey.isActionPending || secondsLeft === 0} onPress={() => void run('claim')} label={journey.isActionPending ? copy.waitlistClaiming : copy.waitlistClaimPay} primary />
          </View>
        ) : null}

        {waitlist.status === 'expired' ? (
          <View style={{ ...card, borderColor: 'rgba(220,38,38,0.35)', backgroundColor: 'rgba(220,38,38,0.06)', gap: 11 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
              <AlertTriangle size={19} color={colors.danger} />
              <Text style={{ color: colors.text, fontWeight: '900', fontSize: 16 }}>{copy.waitlistOfferExpired}</Text>
            </View>
            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {copy.waitlistNoCharge}
            </Text>
            <ActionButton disabled={journey.isActionPending} onPress={() => void run('back')} label={copy.waitlistBack} />
          </View>
        ) : null}

        {waitlist.status === 'claimed' ? (
          <View style={{ ...card, gap: 11 }}>
            <Text style={{ color: colors.text, fontWeight: '900' }}>{copy.waitlistClaimed}</Text>
            <ActionButton disabled={false} onPress={() => router.push('/checkout')} label={copy.waitlistContinueCheckout} primary />
          </View>
        ) : null}

        {journey.actionError ? <Text style={errorText}>{journey.actionError.message}</Text> : null}
      </View>

      <Text style={disclaimer}>
        {copy.waitlistDisclaimer}
      </Text>
    </ParticipantPortalShell>
  );
}

function ActionButton({ disabled, label, onPress, primary }: { disabled: boolean; label: string; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 46,
        alignSelf: 'flex-start',
        justifyContent: 'center',
        borderRadius: 9,
        paddingHorizontal: 17,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        backgroundColor: primary ? colors.primary : colors.surface,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <Text style={{ color: primary ? colors.primaryForeground : colors.text, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  );
}

const card = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 18 } as const;
const errorText = { color: colors.danger, fontSize: 12 } as const;
const disclaimer = { color: colors.textMuted, fontSize: 11, marginTop: 24, textAlign: 'center' } as const;
