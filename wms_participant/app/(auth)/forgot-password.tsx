import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { View } from 'react-native';
import { z } from 'zod';

import { AuthFormLayout } from '@/components/auth/AuthFormLayout';
import { AuthEmailField, AuthPasswordField } from '@/components/auth/AuthFormFields';
import { AppScreen } from '@/components/shell/AppScreen';
import { ErrorState } from '@/components/shell/ErrorState';
import { OtpInput } from '@/components/shell/OtpInput';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { cognitoCopyKey } from '@/features/auth/cognitoCopyKey';
import { useCognitoConfirmReset, useCognitoForgotPassword } from '@/features/auth/hooks/useAuth';
import { useCopy } from '@/i18n';

const emailSchema = z.object({
  identifier: z.string().trim().email(),
});

type EmailValues = z.infer<typeof emailSchema>;

export default function ForgotPasswordScreen() {
  const copy = useCopy();
  const router = useRouter();
  const { showToast } = useToast();
  const send = useCognitoForgotPassword();
  const confirm = useCognitoConfirmReset();
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<EmailValues>({
    resolver: zodResolver(emailSchema),
    defaultValues: { identifier: '' },
    mode: 'onChange',
  });

  const onSend = async ({ identifier }: EmailValues) => {
    setErrorKey(null);
    try {
      await send.mutateAsync(identifier.trim());
      setEmail(identifier.trim());
      setStep('code');
      showToast({ title: copy.toastOtpSent, description: copy.toastOtpSentBody, variant: 'success' });
    } catch (err) {
      setErrorKey(cognitoCopyKey(err, 'cognitoResetFailed'));
    }
  };

  const onSave = async () => {
    setErrorKey(null);
    try {
      await confirm.mutateAsync({ email, code, newPassword: password });
      showToast({ title: copy.cognitoForgotDone, variant: 'success' });
      router.replace('/(auth)/login');
    } catch (err) {
      setErrorKey(cognitoCopyKey(err, 'cognitoInvalidCode'));
    }
  };

  const errorText = errorKey ? copy[errorKey as keyof typeof copy] : undefined;

  return (
    <AppScreen className="px-0" plain>
      <AuthFormLayout hero>
        <Text accessibilityRole="header" className="text-2xl font-bold text-foreground">
          {copy.cognitoForgotTitle}
        </Text>
        <Text className="mt-1 text-base leading-6 text-muted-foreground">{copy.cognitoForgotSubtitle}</Text>

        {step === 'email' ? (
          <View className="mt-6 gap-4">
            <Controller
              control={control}
              name="identifier"
              render={({ field: { onChange, onBlur, value } }) => (
                <AuthEmailField
                  value={value}
                  onChange={onChange}
                  onBlur={onBlur}
                  error={errors.identifier ? copy.authEmailInvalid : undefined}
                  returnKeyType="send"
                  onSubmitEditing={() => {
                    if (isValid && !send.isPending) void handleSubmit(onSend)();
                  }}
                />
              )}
            />
            {errorText ? <ErrorState title={errorText} onRetry={() => setErrorKey(null)} /> : null}
            <Button
              className="h-12 w-full rounded-xl"
              disabled={!isValid || send.isPending}
              accessibilityLabel={send.isPending ? copy.cognitoForgotSending : copy.cognitoForgotSend}
              onPress={handleSubmit(onSend)}>
              <Text className="text-base font-semibold text-primary-foreground">
                {send.isPending ? copy.cognitoForgotSending : copy.cognitoForgotSend}
              </Text>
            </Button>
          </View>
        ) : (
          <View className="mt-6 gap-4">
            <OtpInput
              value={code}
              onChange={setCode}
              accessibilityLabel={copy.cognitoForgotTitle}
              onSubmit={() => {
                if (code.length === 6 && password.length >= 8 && !confirm.isPending) void onSave();
              }}
            />
            <AuthPasswordField
              value={password}
              onChange={setPassword}
              returnKeyType="done"
              onSubmitEditing={() => {
                if (code.length === 6 && password.length >= 8 && !confirm.isPending) void onSave();
              }}
            />
            {password.length > 0 && password.length < 8 ? (
              <Text accessibilityRole="alert" className="text-sm text-destructive">
                {copy.cognitoPasswordMin}
              </Text>
            ) : null}
            {errorText ? <ErrorState title={errorText} onRetry={() => setErrorKey(null)} /> : null}
            <Button
              className="h-12 w-full rounded-xl"
              disabled={code.length !== 6 || password.length < 8 || confirm.isPending}
              accessibilityLabel={confirm.isPending ? copy.cognitoForgotSaving : copy.cognitoForgotSave}
              onPress={onSave}>
              <Text className="text-base font-semibold text-primary-foreground">
                {confirm.isPending ? copy.cognitoForgotSaving : copy.cognitoForgotSave}
              </Text>
            </Button>
          </View>
        )}
      </AuthFormLayout>
    </AppScreen>
  );
}
