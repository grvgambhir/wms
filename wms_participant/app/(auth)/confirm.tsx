import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { AuthFormLayout } from '@/components/auth/AuthFormLayout';
import { AppScreen } from '@/components/shell/AppScreen';
import { ErrorState } from '@/components/shell/ErrorState';
import { OtpInput } from '@/components/shell/OtpInput';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { cognitoCopyKey } from '@/features/auth/cognitoCopyKey';
import { useCognitoConfirmSignUp, useCognitoResendCode } from '@/features/auth/hooks/useAuth';
import { useCopy } from '@/i18n';

export default function ConfirmScreen() {
  const copy = useCopy();
  const router = useRouter();
  const { email: rawEmail } = useLocalSearchParams<{ email?: string }>();
  const email = typeof rawEmail === 'string' ? rawEmail : '';
  const [code, setCode] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const confirm = useCognitoConfirmSignUp();
  const resend = useCognitoResendCode();
  const { showToast } = useToast();

  const onConfirm = async () => {
    setErrorKey(null);
    try {
      await confirm.mutateAsync({ email, code });
      showToast({ title: copy.toastOtpVerified, description: copy.toastLoginSuccessBody, variant: 'success' });
      router.replace('/(auth)/login');
    } catch (err) {
      setErrorKey(cognitoCopyKey(err, 'cognitoInvalidCode'));
    }
  };

  const onResend = async () => {
    setErrorKey(null);
    try {
      await resend.mutateAsync(email);
      showToast({ title: copy.cognitoCodeResent, variant: 'success' });
    } catch (err) {
      setErrorKey(cognitoCopyKey(err, 'cognitoSignUpFailed'));
    }
  };

  const errorText = errorKey ? copy[errorKey as keyof typeof copy] : undefined;

  return (
    <AppScreen className="px-0" plain>
      <AuthFormLayout hero>
        <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">
          {copy.cognitoConfirmTitle}
        </Text>
        <Text className="mt-1 text-base leading-6 text-muted-foreground">
          {copy.cognitoConfirmSubtitle} {email}
        </Text>
        <View className="mt-6">
          <OtpInput
            value={code}
            onChange={setCode}
            accessibilityLabel={copy.cognitoConfirmTitle}
            onSubmit={() => {
              if (code.length === 6 && !confirm.isPending && email) void onConfirm();
            }}
          />
        </View>
        {errorText ? <ErrorState title={errorText} onRetry={() => setErrorKey(null)} /> : null}
        <Button
          className="mt-6 h-12 w-full rounded-xl"
          disabled={code.length !== 6 || confirm.isPending || !email}
          accessibilityLabel={confirm.isPending ? copy.cognitoConfirming : copy.cognitoConfirmAction}
          onPress={onConfirm}>
          <Text className="text-base font-semibold text-primary-foreground">
            {confirm.isPending ? copy.cognitoConfirming : copy.cognitoConfirmAction}
          </Text>
        </Button>
        <Pressable
          className="mt-4 min-h-[44px] items-center justify-center"
          accessibilityRole="button"
          accessibilityLabel={copy.cognitoResendCode}
          onPress={onResend}>
          <Text className="text-sm font-semibold text-primary">{copy.cognitoResendCode}</Text>
        </Pressable>
      </AuthFormLayout>
    </AppScreen>
  );
}
