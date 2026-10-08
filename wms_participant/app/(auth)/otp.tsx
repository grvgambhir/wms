import { useLocalSearchParams, useRouter } from 'expo-router';
import { Mail, ShieldCheck } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthFormLayout } from '@/components/auth/AuthFormLayout';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { OtpInput } from '@/components/shell/OtpInput';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { useRequestOtp, useVerifyOtp } from '@/features/auth/hooks/useAuth';
import { useOtpCountdown } from '@/hooks/useOtpCountdown';
import { useAppLayout } from '@/hooks/useAppLayout';
import { useCopy } from '@/i18n';

/** A02 — OTP Verification (mockup-aligned layout). */
export default function OtpScreen() {
  const router = useRouter();
  const copy = useCopy();
  const { identifier } = useLocalSearchParams<{ identifier?: string }>();
  const [code, setCode] = useState('');
  const [resendCount, setResendCount] = useState(0);
  const verifyOtp = useVerifyOtp();
  const requestOtp = useRequestOtp();
  const { showToast } = useToast();
  const { label: countdownLabel, remaining } = useOtpCountdown(105, resendCount);
  const { isWideWeb } = useAppLayout();

  useEffect(() => {
    if (!identifier) {
      router.replace('/(auth)/login');
    }
  }, [identifier, router]);

  const handleVerify = async () => {
    if (!identifier || code.length !== 6) return;

    try {
      await verifyOtp.mutateAsync({ identifier, code });
      showToast({
        title: copy.toastOtpVerified,
        description: copy.toastOtpVerifiedBody,
        variant: 'success',
      });
      router.replace('/registration-status');
    } catch {
      // Error surfaced below
    }
  };

  const handleResend = async () => {
    if (!identifier) return;
    try {
      await requestOtp.mutateAsync(identifier);
      setResendCount((current) => current + 1);
      setCode('');
      showToast({
        title: copy.toastOtpResent,
        description: copy.toastOtpResentBody,
        variant: 'info',
      });
    } catch {
      // Silent — user can retry from resend link
    }
  };

  if (!identifier) {
    return null;
  }

  return (
    <AppScreen className="px-0" plain>
      <AuthFormLayout hero="wide">
        <AppHeader title="" onBack={() => router.back()} backAccessibilityLabel={copy.authGoBack} />

        <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">{copy.otpHeading}</Text>

        <View className="mt-3 flex-row flex-wrap items-center gap-1">
          <Text className="text-base text-muted-foreground">{copy.otpSentPrefix}</Text>
          <Text className="text-base font-semibold text-primary">{identifier}</Text>
          <Pressable
            onPress={() => router.replace('/(auth)/otp-login')}
            accessibilityRole="link"
            accessibilityLabel={copy.otpChangeEmail}
            className="ml-1 min-h-[44px] justify-center">
            <Text className="text-sm font-semibold text-primary">{copy.otpChangeEmail}</Text>
          </Pressable>
        </View>

        <OtpInput
          value={code}
          onChange={setCode}
          className="mt-8"
          variant="outline"
          accessibilityLabel={copy.authOtpInputLabel}
        />

        {verifyOtp.isError ? (
          <View className="mt-4">
            <ErrorState title={copy.otpInvalid} onRetry={() => setCode('')} />
          </View>
        ) : null}

        <Text className="mt-6 text-center text-sm text-muted-foreground">
          {copy.otpExpiresPrefix}{' '}
          <Text className="font-bold text-primary">{remaining > 0 ? countdownLabel : copy.otpExpired}</Text>
        </Text>

        <View className="mt-6 items-center gap-1">
          <Text className="text-sm text-muted-foreground">{copy.otpResendPrompt}</Text>
          <Pressable
            onPress={handleResend}
            disabled={requestOtp.isPending}
            accessibilityRole="button"
            accessibilityLabel={requestOtp.isPending ? copy.loginSending : copy.otpResendLink}
            accessibilityState={{ disabled: requestOtp.isPending }}
            className="min-h-[44px] justify-center">
            <Text className="text-sm font-semibold text-primary">
              {requestOtp.isPending ? copy.loginSending : copy.otpResendLink}
            </Text>
          </Pressable>
        </View>

        {isWideWeb ? (
          <GradientButton
            className="mt-8 w-full"
            disabled={code.length !== 6 || verifyOtp.isPending}
            accessibilityLabel={verifyOtp.isPending ? copy.otpVerifying : copy.verify}
            onPress={handleVerify}>
            {verifyOtp.isPending ? copy.otpVerifying : copy.verify}
          </GradientButton>
        ) : (
          <View className="mt-auto items-center pb-6 pt-10">
            <View className="relative">
              <View className="rounded-3xl bg-primary/5 p-8">
                <Mail size={56} color="#93C5FD" />
              </View>
              <View className="absolute -bottom-1 -right-1 rounded-full bg-primary p-2">
                <ShieldCheck size={18} color="#FFFFFF" />
              </View>
            </View>
          </View>
        )}
      </AuthFormLayout>

      {!isWideWeb ? (
        <BottomActionBar>
          <GradientButton
            className="w-full"
            disabled={code.length !== 6 || verifyOtp.isPending}
            accessibilityLabel={verifyOtp.isPending ? copy.otpVerifying : copy.verify}
            onPress={handleVerify}>
            {verifyOtp.isPending ? copy.otpVerifying : copy.verify}
          </GradientButton>
        </BottomActionBar>
      ) : null}
    </AppScreen>
  );
}
