import { useQueryClient } from '@tanstack/react-query';
import { zodResolver } from '@hookform/resolvers/zod';
import { Redirect, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Controller, useFieldArray, useForm, type Control, type FieldPath } from 'react-hook-form';
import { Pressable, TextInput, View } from 'react-native';

import { getCognitoAuthClient } from '@/auth/cognitoClient';
import { isUnauthorized, patchMeProfile } from '@/auth/me';
import { isDemoSession } from '@/auth/session';
import { AuthFormLayout } from '@/components/auth/AuthFormLayout';
import { AuthPasswordField } from '@/components/auth/AuthFormFields';
import { AppScreen } from '@/components/shell/AppScreen';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { RepositoryError } from '@/data/errors/repositoryError';
import { useAuthSession, useMeProfile, useSignOut } from '@/features/auth/hooks/useAuth';
import {
  buildProfilePatch,
  copyForProfileRefusal,
  createIdempotencyTracker,
  dobFieldFromRefusal,
  emptyCompleteProfileValues,
  formErrorCopy,
  meToFormValues,
  submitCompleteProfile,
  type CompleteProfileFormValues,
} from '@/features/profile/completeProfile';
import { createCompleteProfileSchema } from '@/features/profile/completeProfileSchema';
import { useCopy, useLocale } from '@/i18n';
import { colors } from '@/theme/colors';

function isOnline(): boolean {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

export function CompleteProfileScreen() {
  const copy = useCopy();
  const { locale } = useLocale();
  const router = useRouter();
  const { showToast } = useToast();
  const { data: session, isLoading: sessionLoading } = useAuthSession();
  const demo = !!session && isDemoSession(session);
  const meQuery = useMeProfile(!!session && !demo);
  const queryClient = useQueryClient();
  const signOut = useSignOut();
  const trackerRef = useRef(createIdempotencyTracker());
  const seededRef = useRef(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [needsReauth, setNeedsReauth] = useState(false);
  const [reauthPassword, setReauthPassword] = useState('');
  const [reauthPending, setReauthPending] = useState(false);
  const [saving, setSaving] = useState(false);

  const schema = useMemo(() => createCompleteProfileSchema(copy), [copy]);
  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
    setError,
    getValues,
  } = useForm<CompleteProfileFormValues>({
    resolver: async (values, context, options) => zodResolver(schema)(values, context, options),
    mode: 'onChange',
    defaultValues: emptyCompleteProfileValues(),
  });
  const contacts = useFieldArray({ control, name: 'emergencyContacts' });

  useEffect(() => {
    if (meQuery.data && !seededRef.current) {
      reset(meToFormValues(meQuery.data));
      seededRef.current = true;
    }
  }, [meQuery.data, reset]);

  if (sessionLoading || (session && !demo && meQuery.isLoading)) {
    return (
      <AppScreen plain>
        <LoadingState />
      </AppScreen>
    );
  }

  if (!session) {
    return <Redirect href="/(auth)/login" />;
  }

  if (demo || meQuery.data?.profileStatus === 'complete') {
    return <Redirect href="/registration-status" />;
  }

  const applyServerError = (err: unknown) => {
    if (err instanceof RepositoryError && dobFieldFromRefusal(err.message)) {
      setError('dateOfBirth', { type: 'server', message: copyForProfileRefusal(err.message, copy) });
      setFormError(null);
      return;
    }
    if (err instanceof RepositoryError && err.message === 'profile.nationality.invalid') {
      setError('nationality', { type: 'server', message: copyForProfileRefusal(err.message, copy) });
      setFormError(null);
      return;
    }
    setFormError(formErrorCopy(err, copy, isOnline()));
  };

  const save = async (values: CompleteProfileFormValues) => {
    setFormError(null);
    setSaving(true);
    try {
      const payload = buildProfilePatch(values, locale);
      const me = await submitCompleteProfile({
        payload,
        tracker: trackerRef.current,
        patch: patchMeProfile,
        reauthenticate: async () => {
          setNeedsReauth(true);
          throw new RepositoryError({ code: 'REAUTH_REQUIRED', message: 'reauth' });
        },
      });
      trackerRef.current.reset();
      setNeedsReauth(false);
      queryClient.setQueryData(['auth', 'me'], me);
      showToast({ title: copy.toastProfileSaved, description: copy.toastProfileSavedBody, variant: 'success' });
      router.replace('/registration-status');
    } catch (err) {
      if (err instanceof RepositoryError && err.code === 'REAUTH_REQUIRED') {
        setFormError(copy.completeProfileSessionExpired);
        return;
      }
      if (isUnauthorized(err)) {
        setNeedsReauth(true);
        setFormError(copy.completeProfileSessionExpired);
        return;
      }
      applyServerError(err);
    } finally {
      setSaving(false);
    }
  };

  const onReauth = async () => {
    const client = getCognitoAuthClient();
    if (!client) {
      setFormError(copy.cognitoUnconfigured);
      return;
    }
    setReauthPending(true);
    setFormError(null);
    try {
      await client.signIn(session.identifier, reauthPassword);
      setNeedsReauth(false);
      setReauthPassword('');
      await save(getValues());
    } catch {
      setFormError(copy.cognitoSignInFailed);
    } finally {
      setReauthPending(false);
    }
  };

  return (
    <AppScreen className="px-0" plain>
      <AuthFormLayout hero>
        <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">
          {copy.cognitoCompleteTitle}
        </Text>
        <Text className="mt-3 text-base leading-6 text-muted-foreground">{copy.cognitoCompleteBody}</Text>
        <Text className="mt-2 text-sm leading-5 text-muted-foreground">{copy.cognitoCompleteHint}</Text>
        <Text className="mt-4 text-sm text-foreground">
          {copy.cognitoSignedInAs} {session.identifier}
        </Text>
        <Text className="mt-1 text-xs text-muted-foreground">{copy.completeProfileEmailHint}</Text>

        <View style={{ marginTop: 20, gap: 12 }}>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Field
              control={control}
              name="givenName"
              label={copy.profileFirstName}
              error={errors.givenName?.message}
            />
            <Field
              control={control}
              name="familyName"
              label={copy.profileLastName}
              error={errors.familyName?.message}
            />
          </View>
          <Field
            control={control}
            name="dateOfBirth"
            label={copy.profileDob}
            error={errors.dateOfBirth?.message}
            inputKind="date"
          />
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: -6 }}>{copy.profileDobHint}</Text>
          <View style={{ flexDirection: 'row', gap: 12 }}>
            <Field
              control={control}
              name="nationality"
              label={`${copy.profileNationality} (${copy.completeProfileOptional})`}
              error={errors.nationality?.message}
              placeholder="IT"
              autoCapitalize="characters"
            />
            <Field
              control={control}
              name="phone"
              label={`${copy.profilePhone} (${copy.completeProfileOptional})`}
              error={errors.phone?.message}
              keyboardType="phone-pad"
            />
          </View>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: -6 }}>
            {copy.completeProfileNationalityHint}
          </Text>

          <Text style={{ color: colors.primary, fontSize: 12, fontWeight: '700' }}>
            {copy.profileGender} ({copy.completeProfileOptional})
          </Text>
          <Controller
            control={control}
            name="gender"
            render={({ field: { value, onChange } }) => (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {(
                  [
                    ['male', copy.profileGenderMale],
                    ['female', copy.profileGenderFemale],
                    ['other', copy.profileGenderOther],
                  ] as const
                ).map(([id, label]) => (
                  <Pressable
                    key={id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: value === id }}
                    onPress={() => onChange(value === id ? '' : id)}
                    style={[chip, value === id ? chipOn : null]}>
                    <Text style={{ color: value === id ? colors.primaryForeground : colors.text, fontWeight: '700' }}>
                      {label}
                    </Text>
                  </Pressable>
                ))}
              </View>
            )}
          />

          <Text accessibilityRole="header" style={{ color: colors.text, fontSize: 17, fontWeight: '800', marginTop: 8 }}>
            {copy.profileEmergencyTitle}
          </Text>
          {contacts.fields.map((field, index) => (
            <View key={field.id} style={contactCard}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                <Text style={{ color: colors.text, fontWeight: '800', fontSize: 13 }}>
                  {copy.completeProfileContactHeading.replace('{n}', String(index + 1))}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={copy.completeProfileRemoveContact}
                  onPress={() => contacts.remove(index)}
                  style={{ minHeight: 44, justifyContent: 'center' }}>
                  <Text style={{ color: colors.danger, fontWeight: '700' }}>{copy.completeProfileRemoveContact}</Text>
                </Pressable>
              </View>
              <Field
                control={control}
                name={`emergencyContacts.${index}.name`}
                label={copy.profileEmergencyName}
                error={errors.emergencyContacts?.[index]?.name?.message}
              />
              <Field
                control={control}
                name={`emergencyContacts.${index}.phone`}
                label={copy.profileEmergencyPhone}
                error={errors.emergencyContacts?.[index]?.phone?.message}
                keyboardType="phone-pad"
              />
              <Field
                control={control}
                name={`emergencyContacts.${index}.relationship`}
                label={copy.completeProfileRelationshipOptional}
                error={errors.emergencyContacts?.[index]?.relationship?.message}
              />
            </View>
          ))}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={copy.completeProfileAddContact}
            onPress={() => contacts.append({ name: '', phone: '', relationship: '' })}
            style={secondaryButton}>
            <Text style={{ color: colors.primary, fontWeight: '800' }}>{copy.completeProfileAddContact}</Text>
          </Pressable>
        </View>

        {needsReauth ? (
          <View style={{ marginTop: 16, gap: 10 }}>
            <Text accessibilityRole="alert" style={{ color: colors.danger, fontSize: 13, fontWeight: '700' }}>
              {copy.completeProfileSessionExpired}
            </Text>
            <AuthPasswordField value={reauthPassword} onChange={setReauthPassword} />
            <Button
              className="h-12 w-full rounded-xl"
              disabled={reauthPassword.length < 8 || reauthPending}
              accessibilityLabel={reauthPending ? copy.completeProfileReauthPending : copy.completeProfileReauth}
              onPress={() => void onReauth()}>
              <Text className="text-base font-semibold text-primary-foreground">
                {reauthPending ? copy.completeProfileReauthPending : copy.completeProfileReauth}
              </Text>
            </Button>
          </View>
        ) : null}

        {formError && !needsReauth ? (
          <View className="mt-4">
            <ErrorState title={formError} onRetry={() => setFormError(null)} />
          </View>
        ) : null}

        <View className="mt-6 gap-3">
          <Button
            className="h-12 w-full rounded-xl"
            disabled={!isValid || saving}
            accessibilityLabel={saving ? copy.completeProfileSubmitting : copy.completeProfileSubmit}
            accessibilityState={{ disabled: !isValid || saving }}
            onPress={handleSubmit(save)}>
            <Text className="text-base font-semibold text-primary-foreground">
              {saving ? copy.completeProfileSubmitting : copy.completeProfileSubmit}
            </Text>
          </Button>
          <Button
            variant="outline"
            className="h-12 w-full rounded-xl"
            accessibilityLabel={copy.toastSignedOut}
            onPress={async () => {
              await signOut.mutateAsync();
            }}>
            <Text className="text-base font-semibold text-foreground">{copy.toastSignedOut}</Text>
          </Button>
        </View>
      </AuthFormLayout>
    </AppScreen>
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
  control: Control<CompleteProfileFormValues>;
  name: FieldPath<CompleteProfileFormValues>;
  label: string;
  error?: string;
  placeholder?: string;
  autoCapitalize?: 'none' | 'characters';
  keyboardType?: 'phone-pad';
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
              value={typeof value === 'string' ? value : ''}
              onChangeText={onChange}
              onBlur={onBlur}
              accessibilityLabel={label}
              style={input}
            />
          ) : (
            <TextInput
              value={typeof value === 'string' ? value : ''}
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
            <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={{ color: colors.danger, fontSize: 12 }}>
              {error}
            </Text>
          ) : null}
        </View>
      )}
    />
  );
}

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

const secondaryButton = {
  minHeight: 44,
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: 10,
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
} as const;

const contactCard = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 12,
  padding: 12,
  gap: 10,
  backgroundColor: colors.surface,
} as const;

const chip = {
  borderWidth: 1,
  borderColor: colors.border,
  borderRadius: 999,
  paddingHorizontal: 14,
  paddingVertical: 10,
  minHeight: 44,
  justifyContent: 'center',
} as const;

const chipOn = {
  backgroundColor: colors.primary,
  borderColor: colors.primary,
} as const;
