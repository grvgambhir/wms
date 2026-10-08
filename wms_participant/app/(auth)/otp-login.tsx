import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';

import { AuthFormLayout } from '@/components/auth/AuthFormLayout';
import { AuthEmailField } from '@/components/auth/AuthFormFields';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useAuthSession, useRequestOtp } from '@/features/auth/hooks/useAuth';
import { loginSchema, type LoginFormValues } from '@/features/auth/schemas/loginSchema';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy } from '@/i18n';

/** Email-only entry point for the OTP sign-in path. */
export default function OtpLoginScreen() {
  const router = useRouter();
  const copy = useCopy();
  const requestOtp = useRequestOtp();
  const { data: session, isLoading } = useAuthSession();
  const { showToast } = useToast();
  const { isWideWeb } = useAppLayout();

  useEffect(() => {
    if (!isLoading && session) {
      router.replace('/registration-status');
    }
  }, [isLoading, router, session]);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { identifier: 'daniel.harper@email.com' },
    mode: 'onChange',
  });

  const onSubmit = async ({ identifier }: LoginFormValues) => {
    try {
      await requestOtp.mutateAsync(identifier.trim());
      showToast({
        title: copy.toastOtpSent,
        description: copy.toastOtpSentBody,
        variant: 'info',
      });
      router.push({
        pathname: '/(auth)/otp',
        params: { identifier: identifier.trim() },
      });
    } catch {
      // surfaced via requestOtp.isError
    }
  };

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState />
      </AppScreen>
    );
  }

  if (session) {
    return null;
  }

  return (
    <AppScreen className="px-0" plain>
      <AuthFormLayout hero="wide">
        <AppHeader
          title={copy.otpLoginTitle}
          subtitle={copy.otpLoginSubtitle}
          onBack={() => router.back()}
          backAccessibilityLabel={copy.authGoBack}
        />

        <Text className="mb-4 text-sm leading-6 text-muted-foreground">{copy.otpLoginHint}</Text>

        <Controller
          control={control}
          name="identifier"
          render={({ field: { onChange, onBlur, value } }) => (
            <AuthEmailField
              value={value}
              onChange={onChange}
              onBlur={onBlur}
              error={errors.identifier ? copy.authIdentifierInvalid : undefined}
            />
          )}
        />

        {requestOtp.isError ? (
          <View className="mt-4">
            <ErrorState title={copy.authOtpSendError} onRetry={() => requestOtp.reset()} />
          </View>
        ) : null}

        {isWideWeb ? (
          <Button
            className="mt-6 h-12 w-full rounded-xl"
            disabled={!isValid || requestOtp.isPending}
            accessibilityLabel={requestOtp.isPending ? copy.loginSending : copy.otpLoginContinue}
            onPress={handleSubmit(onSubmit)}>
            <Text className="text-base font-semibold text-primary-foreground">
              {requestOtp.isPending ? copy.loginSending : copy.otpLoginContinue}
            </Text>
          </Button>
        ) : null}
      </AuthFormLayout>

      {!isWideWeb ? (
        <BottomActionBar>
          <Button
            className="h-12 w-full rounded-xl"
            disabled={!isValid || requestOtp.isPending}
            accessibilityLabel={requestOtp.isPending ? copy.loginSending : copy.otpLoginContinue}
            onPress={handleSubmit(onSubmit)}>
            <Text className="text-base font-semibold text-primary-foreground">
              {requestOtp.isPending ? copy.loginSending : copy.otpLoginContinue}
            </Text>
          </Button>
        </BottomActionBar>
      ) : null}
    </AppScreen>
  );
}
