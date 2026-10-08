// P06 — Profile & consent (PLT-03 / PLT-07 / PRV-02). Participant self-service:
// edit personal fields (RHF + Zod) and grant/withdraw each notice independently.
// Required consents that are not granted surface an "action needed" state.
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { AlertTriangle, KeyRound, ShieldCheck, User } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, Switch, TextInput, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { getCognitoAuthClient } from '@/auth/cognitoClient';
import { completeMfa, disableMfa } from '@/auth/me';
import { applySignedOutCache, useAuthSession, useMeProfile } from '@/features/auth/hooks/useAuth';
import { AUTH_SESSION_QUERY_KEY, cognitoSignOut, isDemoSession } from '@/auth/session';

import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { DateInput } from '@/components/ui/DateInput';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import type { AthleteProfile } from '@/domain/models/athlete';
import type { ConsentKind, ConsentRecord } from '@/domain/models/consent';
import {
  useGrantConsent,
  useParticipantConsents,
  useParticipantProfile,
  useUpdateParticipantProfile,
  useWithdrawConsent,
} from '@/features/profile/hooks/useProfileConsent';
import { dobFieldFromRefusal, formErrorCopy } from '@/features/profile/completeProfile';
import {
  createParticipantProfileSchema,
  type ParticipantProfileFormValues,
} from '@/features/profile/schemas/participantProfileSchema';
import { RepositoryError } from '@/data/errors/repositoryError';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy, type CopyDict } from '@/i18n';
import { formatCompactDate } from '@/lib/format';
import { colors } from '@/theme/colors';

function consentTitle(copy: CopyDict, kind: ConsentKind): string {
  switch (kind) {
    case 'terms_and_conditions':
      return copy.p06ConsentTerms;
    case 'privacy_policy':
      return copy.p06ConsentPrivacy;
    case 'eligibility_medical_evidence':
      return copy.p06ConsentMedical;
    case 'photo_media_accreditation':
      return copy.p06ConsentPhoto;
    case 'marketing_communications':
      return copy.p06ConsentMarketing;
  }
}

function consentBody(copy: CopyDict, kind: ConsentKind): string {
  switch (kind) {
    case 'terms_and_conditions':
      return copy.p06ConsentTermsBody;
    case 'privacy_policy':
      return copy.p06ConsentPrivacyBody;
    case 'eligibility_medical_evidence':
      return copy.p06ConsentMedicalBody;
    case 'photo_media_accreditation':
      return copy.p06ConsentPhotoBody;
    case 'marketing_communications':
      return copy.p06ConsentMarketingBody;
  }
}

function profileToForm(profile: AthleteProfile): ParticipantProfileFormValues {
  return {
    firstName: profile.firstName,
    lastName: profile.lastName,
    dateOfBirth: profile.dateOfBirth,
    nationalityCountryCode: profile.nationalityCountryCode,
    email: profile.email,
    phone: profile.phone ?? '',
    emergencyContactName: profile.emergencyContact?.name ?? '',
    emergencyContactPhone: profile.emergencyContact?.phone ?? '',
  };
}

export default function ParticipantProfileScreen() {
  const copy = useCopy();
  const { isWideWeb } = useAppLayout();
  const { showToast } = useToast();
  const profileQuery = useParticipantProfile();
  const consentsQuery = useParticipantConsents(profileQuery.data?.id);
  const updateProfile = useUpdateParticipantProfile();
  const grant = useGrantConsent();
  const withdraw = useWithdrawConsent();
  const { data: session } = useAuthSession();
  const demo = !!session && isDemoSession(session);
  const me = useMeProfile(!!session && !demo);

  const schema = useMemo(() => createParticipantProfileSchema(copy), [copy]);
  const {
    control,
    handleSubmit,
    reset,
    trigger,
    setError,
    formState: { errors, isValid },
  } = useForm<ParticipantProfileFormValues>({
    resolver: async (values, context, options) => zodResolver(schema)(values, context, options),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      nationalityCountryCode: '',
      email: '',
      phone: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
    },
  });

  useEffect(() => {
    if (profileQuery.data) {
      reset(profileToForm(profileQuery.data));
      void trigger();
    }
  }, [profileQuery.data, reset, trigger]);

  const consents = consentsQuery.data?.items ?? [];
  const actionNeeded = consents.filter((item) => item.required && item.status !== 'granted');

  const onSave = async (values: ParticipantProfileFormValues) => {
    const existing = profileQuery.data;
    if (!existing) return;
    try {
      await updateProfile.mutateAsync({
        id: existing.id,
        firstName: values.firstName,
        lastName: values.lastName,
        dateOfBirth: values.dateOfBirth,
        nationalityCountryCode: values.nationalityCountryCode.toUpperCase(),
        email: values.email,
        phone: values.phone,
        gender: existing.gender,
        passportNumber: existing.passportNumber,
        profileImageKey: existing.profileImageKey,
        profileImageUri: existing.profileImageUri,
        emergencyContact: {
          name: values.emergencyContactName,
          phone: values.emergencyContactPhone,
          relationship: existing.emergencyContact?.relationship,
        },
      });
      showToast({ title: copy.p06ToastSaved, description: copy.p06ToastSavedBody, variant: 'success' });
    } catch (err) {
      // The backend refuses with a reason (e.g. date of birth locked once an entry exists).
      // Swallowing it left the athlete with "Could not save" and no way to know why.
      const reason = formErrorCopy(err, copy, true);
      if (err instanceof RepositoryError && dobFieldFromRefusal(err.message)) {
        setError('dateOfBirth', { type: 'server', message: reason });
      }
      showToast({ title: copy.p06ToastSaveError, description: reason, variant: 'error' });
    }
  };

  const onToggleConsent = async (record: ConsentRecord, nextGranted: boolean) => {
    const key = `${nextGranted ? 'grant' : 'withdraw'}-${record.id}-${Date.now()}`;
    try {
      if (nextGranted) {
        await grant.mutateAsync({ consentId: record.id, idempotencyKey: key });
        showToast({ title: copy.p06ToastConsentGranted, variant: 'success' });
      } else {
        await withdraw.mutateAsync({ consentId: record.id, idempotencyKey: key });
        showToast({ title: copy.p06ToastConsentWithdrawn, variant: 'info' });
      }
    } catch {
      showToast({ title: copy.p06ToastSaveError, variant: 'error' });
    }
  };

  if (profileQuery.isLoading) {
    return (
      <ParticipantPortalShell activeId="profile">
        <LoadingState message={copy.p06Loading} />
      </ParticipantPortalShell>
    );
  }

  if (profileQuery.isError || !profileQuery.data) {
    return (
      <ParticipantPortalShell activeId="profile">
        <ErrorState description={profileQuery.error?.message} onRetry={() => void profileQuery.refetch()} />
      </ParticipantPortalShell>
    );
  }

  const pendingConsentId =
    (grant.isPending ? grant.variables?.consentId : undefined) ??
    (withdraw.isPending ? withdraw.variables?.consentId : undefined);

  return (
    <ParticipantPortalShell activeId="profile">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.p06Breadcrumb}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 }}>
        <User size={22} color={colors.primary} />
        <Text accessibilityRole="header" style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>{copy.p06Title}</Text>
      </View>
      <Text style={{ color: colors.textMuted, marginTop: 4, lineHeight: 20 }}>{copy.p06Subtitle}</Text>

      {actionNeeded.length > 0 ? (
        <View style={actionBanner} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <AlertTriangle size={18} color={colors.warning} />
          <View style={{ flex: 1 }}>
            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '800' }}>{copy.p06ActionNeeded}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {copy.p06ActionNeededBody.replace('{n}', String(actionNeeded.length))}
            </Text>
          </View>
        </View>
      ) : null}

      <View style={{ marginTop: 20, flexDirection: isWideWeb ? 'row' : 'column', gap: 18, alignItems: 'flex-start' }}>
        <View style={{ ...card, flex: 1, minWidth: 280 }}>
          <Text accessibilityRole="header" style={sectionTitle}>{copy.profilePersonalSection}</Text>
          <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 12 }}>
            <Field
              control={control}
              name="firstName"
              label={copy.profileFirstName}
              error={errors.firstName?.message}
            />
            <Field
              control={control}
              name="lastName"
              label={copy.profileLastName}
              error={errors.lastName?.message}
            />
          </View>
          <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 12, marginTop: 12 }}>
            <Field
              control={control}
              name="dateOfBirth"
              label={copy.profileDob}
              error={errors.dateOfBirth?.message}
              inputKind="date"
            />
            <Field
              control={control}
              name="nationalityCountryCode"
              label={copy.profileNationality}
              error={errors.nationalityCountryCode?.message}
              placeholder="GB"
              autoCapitalize="characters"
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>{copy.profileDobHint}</Text>

          <Text accessibilityRole="header" style={[sectionTitle, { marginTop: 22 }]}>{copy.profileContactSection}</Text>
          <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 12 }}>
            <Field
              control={control}
              name="email"
              label={copy.profileEmail}
              error={errors.email?.message}
              autoCapitalize="none"
              keyboardType="email-address"
            />
            <Field
              control={control}
              name="phone"
              label={copy.profilePhone}
              error={errors.phone?.message}
              keyboardType="phone-pad"
            />
          </View>

          <Text accessibilityRole="header" style={[sectionTitle, { marginTop: 22 }]}>{copy.profileEmergencyTitle}</Text>
          <View style={{ flexDirection: isWideWeb ? 'row' : 'column', gap: 12 }}>
            <Field
              control={control}
              name="emergencyContactName"
              label={copy.profileEmergencyName}
              error={errors.emergencyContactName?.message}
            />
            <Field
              control={control}
              name="emergencyContactPhone"
              label={copy.profileEmergencyPhone}
              error={errors.emergencyContactPhone?.message}
              keyboardType="phone-pad"
            />
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.p06Save}
            accessibilityState={{ disabled: !isValid || updateProfile.isPending }}
            disabled={!isValid || updateProfile.isPending}
            onPress={handleSubmit(onSave)}
            style={[primaryButton, { opacity: !isValid || updateProfile.isPending ? 0.55 : 1 }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>
              {updateProfile.isPending ? copy.p06Saving : copy.p06Save}
            </Text>
          </Pressable>
        </View>

        <View style={{ ...card, width: isWideWeb ? 420 : '100%' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <ShieldCheck size={18} color={colors.primary} />
            <Text accessibilityRole="header" style={sectionTitle}>{copy.p06ConsentSection}</Text>
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginBottom: 8 }}>
            {copy.p06ConsentIntro}
          </Text>

          {consentsQuery.isLoading ? (
            <LoadingState message={copy.p06Loading} />
          ) : (
            consents.map((record) => {
              const needsAction = record.required && record.status !== 'granted';
              const granted = record.status === 'granted';
              return (
                <View
                  key={record.id}
                  style={[consentRow, needsAction ? consentRowAction : null]}
                >
                  <View style={{ flex: 1, paddingRight: 10 }}>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
                        {consentTitle(copy, record.kind)}
                      </Text>
                      <Pill
                        label={record.required ? copy.p06ConsentRequired : copy.p06ConsentOptional}
                        color={record.required ? colors.warning : colors.textMuted}
                      />
                      {record.sensitive ? <Pill label={copy.p06ConsentSensitive} color={colors.danger} /> : null}
                      {needsAction ? <Pill label={copy.p06ActionNeeded} color={colors.warning} /> : null}
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 }}>
                      {consentBody(copy, record.kind)}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>
                      {granted ? copy.p06ConsentGranted : copy.p06ConsentWithdrawn}
                      {' · '}
                      {copy.p06ConsentPolicyVersion.replace('{version}', record.policyVersion)}
                      {' · '}
                      {copy.p06ConsentUpdatedAt.replace('{date}', formatCompactDate(record.updatedAt))}
                    </Text>
                  </View>
                  <Switch
                    value={granted}
                    disabled={pendingConsentId === record.id}
                    onValueChange={(next) => void onToggleConsent(record, next)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor={colors.surface}
                    accessibilityLabel={consentTitle(copy, record.kind)}
                    accessibilityState={{ checked: granted }}
                  />
                </View>
              );
            })
          )}
        </View>
      </View>

      {!demo ? (
        <ParticipantMfaCard
          copy={copy}
          enrolled={me.data?.mfa?.enrolled === true}
          email={me.data?.email ?? session?.identifier ?? ''}
          onRefetchMe={() => void me.refetch()}
        />
      ) : null}

      <Text style={disclaimer}>{copy.p06Disclaimer}</Text>
    </ParticipantPortalShell>
  );
}

function ParticipantMfaCard({
  copy,
  enrolled,
  email,
  onRefetchMe,
}: {
  copy: CopyDict;
  enrolled: boolean;
  email: string;
  onRefetchMe: () => void;
}) {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const startEnrol = async () => {
    const client = getCognitoAuthClient();
    if (!client?.startTotpSetup) {
      showToast({ title: copy.p06MfaError, variant: 'error' });
      return;
    }
    setBusy(true);
    try {
      setSetup(await client.startTotpSetup(email));
    } catch {
      showToast({ title: copy.p06MfaError, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const verifyEnrol = async () => {
    const client = getCognitoAuthClient();
    if (!client?.verifyAndEnableTotp || !code.trim()) return;
    setBusy(true);
    try {
      await client.verifyAndEnableTotp(code.trim());
      await completeMfa();
      await cognitoSignOut();
      applySignedOutCache(queryClient);
      showToast({ title: copy.p06MfaEnrolledToast, variant: 'success' });
      router.replace('/(auth)/login');
    } catch {
      showToast({ title: copy.p06MfaError, variant: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const unenrol = () => {
    Alert.alert(copy.p06MfaUnenrol, copy.p06MfaUnenrolConfirm, [
      { text: copy.documentsMenuCancel, style: 'cancel' },
      {
        text: copy.p06MfaUnenrol,
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const client = getCognitoAuthClient();
            setBusy(true);
            try {
              if (client?.disableTotp) await client.disableTotp();
              await disableMfa();
              onRefetchMe();
              queryClient.invalidateQueries({ queryKey: ['auth', 'me'] });
              queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
              showToast({ title: copy.p06MfaDisabledToast, variant: 'info' });
            } catch {
              showToast({ title: copy.p06MfaError, variant: 'error' });
            } finally {
              setBusy(false);
            }
          })();
        },
      },
    ]);
  };

  return (
    <View style={{ ...card, marginTop: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <KeyRound size={18} color={colors.primary} />
        <Text accessibilityRole="header" style={sectionTitle}>
          {copy.p06MfaSection}
        </Text>
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18 }}>{copy.p06MfaIntro}</Text>
      <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700', marginTop: 10 }}>
        {enrolled ? copy.p06MfaEnrolled : copy.p06MfaNotEnrolled}
      </Text>
      <Text style={{ color: colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 6 }}>{copy.p06MfaRecovery}</Text>

      {setup ? (
        <View style={{ marginTop: 14, alignItems: 'center', gap: 10 }}>
          <QRCode value={setup.uri} size={168} />
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{copy.p06MfaSecret}</Text>
          <Text selectable style={{ color: colors.text, fontFamily: 'monospace', fontSize: 13 }}>
            {setup.secret}
          </Text>
          <TextInput
            value={code}
            onChangeText={setCode}
            placeholder={copy.p06MfaCode}
            placeholderTextColor={colors.textMuted}
            keyboardType="number-pad"
            accessibilityLabel={copy.p06MfaCode}
            style={input}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.p06MfaVerify}
            disabled={busy || code.trim().length < 6}
            onPress={() => void verifyEnrol()}
            style={[primaryButton, { opacity: busy || code.trim().length < 6 ? 0.55 : 1 }]}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>
              {busy ? copy.p06MfaVerifying : copy.p06MfaVerify}
            </Text>
          </Pressable>
        </View>
      ) : enrolled ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.p06MfaUnenrol}
          disabled={busy}
          onPress={unenrol}
          style={[primaryButton, { backgroundColor: colors.danger, opacity: busy ? 0.55 : 1 }]}
        >
          <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{copy.p06MfaUnenrol}</Text>
        </Pressable>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.p06MfaEnrol}
          disabled={busy}
          onPress={() => void startEnrol()}
          style={[primaryButton, { opacity: busy ? 0.55 : 1 }]}
        >
          <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>
            {busy ? copy.p06MfaPreparing : copy.p06MfaEnrol}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

function Field({
  control,
  name,
  label,
  error,
  placeholder,
  autoCapitalize,
  keyboardType,
  inputKind = 'text',
}: {
  control: ReturnType<typeof useForm<ParticipantProfileFormValues>>['control'];
  name: keyof ParticipantProfileFormValues;
  label: string;
  error?: string;
  placeholder?: string;
  autoCapitalize?: 'none' | 'characters';
  keyboardType?: 'email-address' | 'phone-pad';
  inputKind?: 'text' | 'date';
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field: { onChange, onBlur, value } }) => (
        <View style={{ flex: 1, minWidth: 140, gap: 6 }}>
          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>{label}</Text>
          {inputKind === 'date' ? (
            <DateInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              accessibilityLabel={label}
              style={input}
            />
          ) : (
            <TextInput
              value={value}
              onChangeText={onChange}
              onBlur={onBlur}
              placeholder={placeholder}
              placeholderTextColor={colors.textMuted}
              autoCapitalize={autoCapitalize}
              keyboardType={keyboardType}
              accessibilityLabel={label}
              style={input}
            />
          )}
          {error ? (
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 12 }}>{error}</Text>
          ) : null}
        </View>
      )}
    />
  );
}

function Pill({ label, color }: { label: string; color: string }) {
  return (
    <View style={{ borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, backgroundColor: `${color}18` }}>
      <Text style={{ color, fontSize: 10, fontWeight: '900' }}>{label.toUpperCase()}</Text>
    </View>
  );
}

const card = { borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 14, padding: 18 } as const;
const sectionTitle = { color: colors.text, fontSize: 17, fontWeight: '800', marginBottom: 10 } as const;
const input = {
  minHeight: 48,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 10,
  paddingHorizontal: 12,
  color: colors.text,
  fontSize: 14,
  backgroundColor: colors.surface,
} as const;
const primaryButton = {
  marginTop: 18,
  minHeight: 48,
  alignSelf: 'flex-start',
  justifyContent: 'center',
  borderRadius: 10,
  paddingHorizontal: 18,
  backgroundColor: colors.primary,
} as const;
const consentRow = {
  marginTop: 12,
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 12,
  padding: 12,
  flexDirection: 'row',
  alignItems: 'center',
} as const;
const consentRowAction = {
  borderColor: 'rgba(245,158,11,0.45)',
  backgroundColor: 'rgba(245,158,11,0.07)',
} as const;
const actionBanner = {
  marginTop: 16,
  flexDirection: 'row',
  alignItems: 'center',
  gap: 10,
  borderWidth: 1,
  borderColor: 'rgba(245,158,11,0.4)',
  backgroundColor: 'rgba(245,158,11,0.08)',
  borderRadius: 12,
  paddingHorizontal: 14,
  paddingVertical: 12,
} as const;
const disclaimer = { color: colors.textMuted, fontSize: 11, marginTop: 24, textAlign: 'center' } as const;
