import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Pressable, View } from 'react-native';

import { isDemoAuthEnabled } from '@/auth/env';
import { isDemoSession, landingHref } from '@/auth/session';
import { AuthFormLayout } from '@/components/auth/AuthFormLayout';
import { AuthEmailField, AuthOrDivider, AuthPasswordField } from '@/components/auth/AuthFormFields';
import { AuthModeTabs, type AuthMode } from '@/components/auth/AuthModeTabs';
import { AppScreen } from '@/components/shell/AppScreen';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { DEMO_PASSWORD } from '@/constants/demo';
import { cognitoCopyKey } from '@/features/auth/cognitoCopyKey';
import {
  useAuthSession,
  useCognitoConfirmTotp,
  useCognitoSignIn,
  useCognitoSignUp,
  useMeProfile,
  useSignInWithPassword,
} from '@/features/auth/hooks/useAuth';
import {
  cognitoPasswordSchema,
  cognitoSignUpSchema,
  type CognitoPasswordFormValues,
  type CognitoSignUpFormValues,
} from '@/features/auth/schemas/cognitoSchema';
import { useCopy } from '@/i18n';

export function CognitoLoginScreen() {
  const router = useRouter();
  const copy = useCopy();
  const { data: session, isLoading } = useAuthSession();
  const { showToast } = useToast();
  const [mode, setMode] = useState<AuthMode>('login');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [totpPending, setTotpPending] = useState(false);
  const [totpCode, setTotpCode] = useState('');
  const signIn = useCognitoSignIn();
  const confirmTotp = useCognitoConfirmTotp();
  const signUp = useCognitoSignUp();
  const demoSignIn = useSignInWithPassword();
  const demoEnabled = isDemoAuthEnabled();
  const demoSession = !!session && isDemoSession(session);
  const me = useMeProfile(!!session && !demoSession);

  useEffect(() => {
    if (isLoading || !session) return;
    if (demoSession) {
      router.replace('/registration-status');
      return;
    }
    if (me.isLoading) return;
    router.replace(landingHref(session, me.data ?? null));
  }, [demoSession, isLoading, me.data, me.isLoading, router, session]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<CognitoPasswordFormValues>({
    resolver: zodResolver(cognitoPasswordSchema),
    defaultValues: { identifier: '', password: '' },
    mode: 'onChange',
  });

  const {
    control: signUpControl,
    handleSubmit: handleSignUpSubmit,
    formState: { errors: signUpErrors, isValid: signUpIsValid },
  } = useForm<CognitoSignUpFormValues>({
    resolver: zodResolver(cognitoSignUpSchema),
    defaultValues: { firstName: '', lastName: '', identifier: '', password: '' },
    mode: 'onChange',
  });

  const onSubmit = async ({ identifier, password }: CognitoPasswordFormValues) => {
    setErrorKey(null);
    try {
      const result = await signIn.mutateAsync({ email: identifier.trim(), password });
      if (result.next === 'totp_required') {
        setTotpPending(true);
        setTotpCode('');
        return;
      }
      showToast({ title: copy.toastLoginSuccess, description: copy.toastLoginSuccessBody, variant: 'success' });
      router.replace(landingHref(result.session, result.me));
    } catch (err) {
      setErrorKey(cognitoCopyKey(err, 'cognitoSignInFailed'));
    }
  };

  const onTotp = async () => {
    setErrorKey(null);
    try {
      const result = await confirmTotp.mutateAsync(totpCode.trim());
      showToast({ title: copy.toastLoginSuccess, description: copy.toastLoginSuccessBody, variant: 'success' });
      router.replace(landingHref(result.session, result.me));
    } catch (err) {
      setErrorKey(cognitoCopyKey(err, 'cognitoTotpInvalid'));
    }
  };

  const onSignUp = async ({ firstName, lastName, identifier, password }: CognitoSignUpFormValues) => {
    setErrorKey(null);
    try {
      await signUp.mutateAsync({
        givenName: firstName,
        familyName: lastName,
        email: identifier.trim(),
        password,
      });
      showToast({
        title: copy.toastSignUpSuccess,
        description: copy.toastOtpSentBody,
        variant: 'success',
        durationMs: 4000,
      });
      router.push({ pathname: '/(auth)/confirm', params: { email: identifier.trim() } });
    } catch (err) {
      setErrorKey(cognitoCopyKey(err, 'cognitoSignUpFailed'));
    }
  };

  const onDemo = async () => {
    setErrorKey(null);
    try {
      await demoSignIn.mutateAsync({ identifier: 'daniel.harper@email.com', password: DEMO_PASSWORD });
      showToast({ title: copy.toastLoginSuccess, description: copy.toastLoginSuccessBody, variant: 'success' });
      router.replace('/registration-status');
    } catch {
      setErrorKey('loginInvalidCredentials');
    }
  };

  if (isLoading || session) {
    return (
      <AppScreen>
        <LoadingState />
      </AppScreen>
    );
  }

  const errorText = errorKey ? copy[errorKey as keyof typeof copy] : undefined;
  const submitLogin = handleSubmit(onSubmit);
  const submitSignUp = handleSignUpSubmit(onSignUp);

  if (totpPending) {
    return (
      <AppScreen className="px-0" plain>
        <AuthFormLayout hero>
          <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">
            {copy.cognitoTotpTitle}
          </Text>
          <Text className="mt-1 text-base leading-6 text-muted-foreground">{copy.cognitoTotpSubtitle}</Text>
          <View className="mt-5 gap-4">
            <Input
              value={totpCode}
              onChangeText={setTotpCode}
              placeholder={copy.cognitoTotpPlaceholder}
              accessibilityLabel={copy.cognitoTotpPlaceholder}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              returnKeyType="go"
              blurOnSubmit
              onSubmitEditing={() => {
                if (totpCode.trim().length >= 6 && !confirmTotp.isPending) void onTotp();
              }}
              className="h-12 rounded-xl border-border/60 bg-white"
            />
            {errorText ? <ErrorState title={errorText} onRetry={() => setErrorKey(null)} /> : null}
            <Button
              className="h-12 w-full rounded-xl"
              disabled={totpCode.trim().length < 6 || confirmTotp.isPending}
              accessibilityLabel={confirmTotp.isPending ? copy.cognitoTotpVerifying : copy.cognitoTotpAction}
              onPress={() => void onTotp()}>
              <Text className="text-base font-semibold text-primary-foreground">
                {confirmTotp.isPending ? copy.cognitoTotpVerifying : copy.cognitoTotpAction}
              </Text>
            </Button>
            <Pressable
              className="min-h-[44px] justify-center"
              accessibilityRole="button"
              accessibilityLabel={copy.loginTabLogin}
              onPress={() => {
                setTotpPending(false);
                setTotpCode('');
                setErrorKey(null);
              }}>
              <Text className="text-center text-sm font-semibold text-primary">{copy.loginTabLogin}</Text>
            </Pressable>
          </View>
        </AuthFormLayout>
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0" plain>
      <AuthFormLayout hero>
        <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">
          {copy.loginWelcome}
        </Text>
        <Text className="mt-1 text-base leading-6 text-muted-foreground">
          {mode === 'login' ? copy.loginSubtitle : copy.loginSignUpSubtitle}
        </Text>

        <View className="mt-5">
          <AuthModeTabs value={mode} onChange={setMode} />
        </View>

        {mode === 'login' ? (
          <View className="mt-5 gap-4">
            <Controller
              control={control}
              name="identifier"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthEmailField
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={errors.identifier ? copy.authEmailInvalid : undefined}
                  returnKeyType="go"
                  blurOnSubmit
                  onSubmitEditing={() => {
                    if (!signIn.isPending) void submitLogin();
                  }}
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, value } }) => (
                <View className="gap-1.5">
                  <AuthPasswordField
                    value={value}
                    onChange={onChange}
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      if (!signIn.isPending) void submitLogin();
                    }}
                  />
                  {errors.password ? (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      className="text-sm text-destructive">
                      {copy.cognitoPasswordMin}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <Pressable
              className="min-h-[44px] justify-center self-end"
              accessibilityRole="button"
              accessibilityLabel={copy.loginForgotPassword}
              onPress={() => router.push('/(auth)/forgot-password')}>
              <Text className="text-sm font-semibold text-primary">{copy.loginForgotPassword}</Text>
            </Pressable>
            {errorText ? (
              <ErrorState title={errorText} onRetry={() => setErrorKey(null)} />
            ) : null}
            <Button
              className="h-12 w-full rounded-xl"
              disabled={!isValid || signIn.isPending}
              accessibilityLabel={signIn.isPending ? copy.loginSigningIn : copy.continue}
              onPress={submitLogin}>
              <Text className="text-base font-semibold text-primary-foreground">
                {signIn.isPending ? copy.loginSigningIn : copy.continue}
              </Text>
            </Button>
            {demoEnabled ? (
              <>
                <AuthOrDivider />
                <Button
                  variant="outline"
                  className="h-12 w-full rounded-xl border-border/80 bg-white"
                  accessibilityLabel={copy.loginDemoEntry}
                  disabled={demoSignIn.isPending}
                  onPress={onDemo}>
                  <Text className="text-base font-semibold text-foreground">{copy.loginDemoEntry}</Text>
                </Button>
                <Button
                  variant="outline"
                  className="h-12 w-full rounded-xl border-border/80 bg-white"
                  accessibilityLabel={copy.loginOtpMethod}
                  onPress={() => router.push('/(auth)/otp-login')}>
                  <Text className="text-base font-semibold text-foreground">{copy.loginOtpMethod}</Text>
                </Button>
              </>
            ) : null}
          </View>
        ) : (
          <View className="mt-5 gap-4">
            <Controller
              control={signUpControl}
              name="firstName"
              render={({ field: { onChange, onBlur, value } }) => (
                <View className="gap-1.5">
                  <Input
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder={copy.loginFirstNamePlaceholder}
                    accessibilityLabel={copy.loginFirstNamePlaceholder}
                    autoCapitalize="words"
                    className="h-12 rounded-xl border-border/60 bg-white"
                  />
                  {signUpErrors.firstName ? (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      className="text-sm text-destructive">
                      {copy.authFirstNameRequired}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={signUpControl}
              name="lastName"
              render={({ field: { onChange, onBlur, value } }) => (
                <View className="gap-1.5">
                  <Input
                    value={value}
                    onChangeText={onChange}
                    onBlur={onBlur}
                    placeholder={copy.loginLastNamePlaceholder}
                    accessibilityLabel={copy.loginLastNamePlaceholder}
                    autoCapitalize="words"
                    className="h-12 rounded-xl border-border/60 bg-white"
                  />
                  {signUpErrors.lastName ? (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      className="text-sm text-destructive">
                      {copy.authLastNameRequired}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            <Controller
              control={signUpControl}
              name="identifier"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthEmailField
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={signUpErrors.identifier ? copy.authEmailInvalid : undefined}
                />
              )}
            />
            <Controller
              control={signUpControl}
              name="password"
              render={({ field: { onChange, value } }) => (
                <View className="gap-1.5">
                  <AuthPasswordField
                    value={value}
                    onChange={onChange}
                    returnKeyType="go"
                    onSubmitEditing={() => {
                      if (!signUp.isPending) void submitSignUp();
                    }}
                  />
                  {signUpErrors.password ? (
                    <Text
                      accessibilityRole="alert"
                      accessibilityLiveRegion="polite"
                      className="text-sm text-destructive">
                      {copy.cognitoPasswordMin}
                    </Text>
                  ) : null}
                </View>
              )}
            />
            {errorText ? <ErrorState title={errorText} onRetry={() => setErrorKey(null)} /> : null}
            <Button
              className="h-12 w-full rounded-xl"
              disabled={!signUpIsValid || signUp.isPending}
              accessibilityLabel={signUp.isPending ? copy.loginCreatingAccount : copy.loginCreateAccount}
              onPress={submitSignUp}>
              <Text className="text-base font-semibold text-primary-foreground">
                {signUp.isPending ? copy.loginCreatingAccount : copy.loginCreateAccount}
              </Text>
            </Button>
          </View>
        )}
      </AuthFormLayout>
    </AppScreen>
  );
}
