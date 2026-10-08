// P03 — Claim pre-registration (REG-13). Como Lake 2027 migrates ~15k legacy EOI records;
// a pre-registered participant enters their claim reference or email, confirms a
// privacy-masked identity preview, and claims the record to bring their details across.
// Reads through the pre-registration repository (backend-adaptable §6.6). Auth-time flow,
// so it lives in (auth) and reuses the auth shell — not the post-login portal.
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View, Pressable } from 'react-native';

import { AuthFormLayout } from '@/components/auth/AuthFormLayout';
import { AppScreen } from '@/components/shell/AppScreen';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useClaimPreRegistration, usePreRegistrationLookup } from '@/features/auth/hooks/usePreRegistration';
import { countryName, flagEmoji } from '@/lib/format';
import { useCopy } from '@/i18n';

export default function ClaimPreRegistrationScreen() {
  const router = useRouter();
  const copy = useCopy();
  const { showToast } = useToast();
  const lookup = usePreRegistrationLookup();
  const claim = useClaimPreRegistration();

  const [query, setQuery] = useState('');

  const result = lookup.data;
  const claimed = claim.data;
  const preview = result && result.outcome !== 'not_found' ? result.preview : undefined;

  const onLookup = async () => {
    const q = query.trim();
    if (!q) return;
    claim.reset();
    await lookup.mutateAsync({ query: q });
  };

  const onClaim = async () => {
    if (!preview) return;
    try {
      const res = await claim.mutateAsync({ recordId: preview.id, idempotencyKey: `claim-${preview.id}` });
      showToast({
        title: copy.claimedTitle,
        description: `${res.record.firstName} ${res.record.lastName} · ${res.record.reference}`,
        variant: 'success',
      });
    } catch {
      showToast({ title: copy.claimError, variant: 'error' });
    }
  };

  const resetAll = () => {
    lookup.reset();
    claim.reset();
    setQuery('');
  };

  return (
    <AppScreen className="px-0" plain>
      <AuthFormLayout hero>
        <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{copy.claimTitle}</Text>
        <Text className="mt-1 text-base leading-6 text-muted-foreground">{copy.claimSubtitle}</Text>

        {/* Success — claimed */}
        {claimed ? (
          <View className="mt-6 gap-4">
            <View className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <Text className="text-base font-bold text-emerald-800">{copy.claimedTitle}</Text>
              <Text className="mt-1 text-sm leading-5 text-emerald-700">{copy.claimedBody}</Text>
              <View className="mt-3 gap-1.5">
                <PreviewRow label={copy.claimName} value={`${claimed.record.firstName} ${claimed.record.lastName}`} />
                <PreviewRow label={copy.claimEmail} value={claimed.record.email} />
                <PreviewRow
                  label={copy.claimNationality}
                  value={`${flagEmoji(claimed.record.nationalityCountryCode)} ${countryName(claimed.record.nationalityCountryCode)}`}
                />
                <PreviewRow label={copy.claimSports} value={claimed.record.intendedSports.join(', ') || '—'} />
              </View>
            </View>
            <Button className="h-12 w-full rounded-xl" accessibilityLabel={copy.claimContinue} onPress={() => router.replace('/(participant)/sport-entry')}>
              <Text className="text-base font-semibold text-primary-foreground">{copy.claimContinue}</Text>
            </Button>
          </View>
        ) : result?.outcome === 'found' && preview ? (
          /* Match — masked preview + claim */
          <View className="mt-6 gap-4">
            <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">{copy.claimFoundTitle}</Text>
            <Text className="text-sm leading-5 text-muted-foreground">{copy.claimFoundHelp}</Text>
            <View className="rounded-2xl border border-border/70 bg-white p-4">
              <View className="gap-1.5">
                <PreviewRow label={copy.claimReference} value={preview.reference} />
                <PreviewRow label={copy.claimName} value={preview.maskedName} />
                <PreviewRow label={copy.claimEmail} value={preview.maskedEmail} />
                <PreviewRow label={copy.claimBirthYear} value={String(preview.birthYear)} />
                <PreviewRow
                  label={copy.claimNationality}
                  value={`${flagEmoji(preview.nationalityCountryCode)} ${countryName(preview.nationalityCountryCode)}`}
                />
                <PreviewRow label={copy.claimSports} value={preview.intendedSports.join(', ') || '—'} />
              </View>
            </View>
            <Button
              className="h-12 w-full rounded-xl"
              disabled={claim.isPending}
              accessibilityLabel={claim.isPending ? copy.claimClaiming : copy.claimConfirm}
              onPress={() => void onClaim()}>
              <Text className="text-base font-semibold text-primary-foreground">
                {claim.isPending ? copy.claimClaiming : copy.claimConfirm}
              </Text>
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl border-border/80 bg-white" accessibilityLabel={copy.claimTryAgain} onPress={resetAll}>
              <Text className="text-base font-semibold text-foreground">{copy.claimTryAgain}</Text>
            </Button>
          </View>
        ) : result?.outcome === 'already_claimed' ? (
          /* Already claimed */
          <View className="mt-6 gap-4">
            <View className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <Text className="text-base font-bold text-amber-800">{copy.claimAlreadyTitle}</Text>
              <Text className="mt-1 text-sm leading-5 text-amber-700">{copy.claimAlreadyBody}</Text>
            </View>
            <Button className="h-12 w-full rounded-xl" accessibilityLabel={copy.claimSignIn} onPress={() => router.replace('/(auth)/login')}>
              <Text className="text-base font-semibold text-primary-foreground">{copy.claimSignIn}</Text>
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl border-border/80 bg-white" accessibilityLabel={copy.claimTryAgain} onPress={resetAll}>
              <Text className="text-base font-semibold text-foreground">{copy.claimTryAgain}</Text>
            </Button>
          </View>
        ) : result?.outcome === 'not_found' ? (
          /* Not found */
          <View className="mt-6 gap-4">
            <View className="rounded-2xl border border-border/70 bg-muted/40 p-4">
              <Text className="text-base font-bold text-foreground">{copy.claimNotFoundTitle}</Text>
              <Text className="mt-1 text-sm leading-5 text-muted-foreground">{copy.claimNotFoundBody}</Text>
            </View>
            <Button className="h-12 w-full rounded-xl" accessibilityLabel={copy.claimRegisterNew} onPress={() => router.replace('/(auth)/login')}>
              <Text className="text-base font-semibold text-primary-foreground">{copy.claimRegisterNew}</Text>
            </Button>
            <Button variant="outline" className="h-12 w-full rounded-xl border-border/80 bg-white" accessibilityLabel={copy.claimTryAgain} onPress={resetAll}>
              <Text className="text-base font-semibold text-foreground">{copy.claimTryAgain}</Text>
            </Button>
          </View>
        ) : (
          /* Initial — lookup form */
          <View className="mt-6 gap-4">
            <View className="gap-1.5">
              <Text accessibilityRole="header" className="text-sm font-semibold text-foreground">{copy.claimQueryLabel}</Text>
              <Input
                value={query}
                onChangeText={setQuery}
                placeholder={copy.claimQueryPlaceholder}
                accessibilityLabel={copy.claimQueryLabel}
                autoCapitalize="characters"
                autoCorrect={false}
                className="h-12 rounded-xl border-border/60 bg-white"
                onSubmitEditing={() => void onLookup()}
              />
              <Text className="text-xs text-muted-foreground">{copy.claimHint}</Text>
            </View>
            <Button
              className="h-12 w-full rounded-xl"
              disabled={query.trim().length === 0 || lookup.isPending}
              accessibilityLabel={lookup.isPending ? copy.claimLooking : copy.claimLookup}
              onPress={() => void onLookup()}>
              <Text className="text-base font-semibold text-primary-foreground">
                {lookup.isPending ? copy.claimLooking : copy.claimLookup}
              </Text>
            </Button>
          </View>
        )}

        {/* Back to sign in */}
        <View className="mt-8 flex-row flex-wrap items-center justify-center gap-1">
          <Text className="text-sm text-muted-foreground">{copy.claimBackPrefix}</Text>
          <Pressable accessibilityRole="link" accessibilityLabel={copy.claimBackLink} onPress={() => router.replace('/(auth)/login')}>
            <Text className="text-sm font-semibold text-primary">{copy.claimBackLink}</Text>
          </Pressable>
        </View>
      </AuthFormLayout>
    </AppScreen>
  );
}

/** A label/value row inside the preview + claimed cards. */
function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <View className="flex-row items-start justify-between gap-3">
      <Text className="text-sm text-muted-foreground">{label}</Text>
      <Text className="flex-1 text-right text-sm font-semibold text-foreground">{value}</Text>
    </View>
  );
}
