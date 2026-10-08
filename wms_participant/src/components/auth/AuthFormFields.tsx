import type { ReactNode } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, View, type TextInputProps } from 'react-native';

import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { useCopy } from '@/i18n';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type AuthFieldIconProps = {
  children: ReactNode;
  className?: string;
};

function AuthFieldIcon({ children, className }: AuthFieldIconProps) {
  return <View className={cn('absolute left-3 top-1/2 z-10 -translate-y-1/2', className)}>{children}</View>;
}

type AuthEmailFieldProps = {
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
  blurOnSubmit?: boolean;
};

export function AuthEmailField({
  value,
  onChange,
  onBlur,
  error,
  returnKeyType,
  onSubmitEditing,
  blurOnSubmit,
}: AuthEmailFieldProps) {
  const copy = useCopy();

  return (
    <View className="gap-1.5">
      <View className="relative">
        <AuthFieldIcon>
          <Mail size={18} color={colors.textMuted} />
        </AuthFieldIcon>
        <Input
          value={value}
          onChangeText={onChange}
          onBlur={onBlur}
          placeholder={copy.loginEmailPlaceholder}
          accessibilityLabel={copy.loginEmailPlaceholder}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          textContentType="username"
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          blurOnSubmit={blurOnSubmit}
          className="h-12 rounded-xl border-border/60 bg-white pl-11"
        />
      </View>
      {error ? (
        <Text accessibilityRole="alert" accessibilityLiveRegion="polite" className="text-sm text-destructive">{error}</Text>
      ) : null}
    </View>
  );
}

type AuthPasswordFieldProps = {
  value: string;
  onChange: (value: string) => void;
  returnKeyType?: TextInputProps['returnKeyType'];
  onSubmitEditing?: TextInputProps['onSubmitEditing'];
};

/** Visual-only password field for mockup parity — POC auth still uses OTP after Continue. */
export function AuthPasswordField({ value, onChange, returnKeyType, onSubmitEditing }: AuthPasswordFieldProps) {
  const copy = useCopy();
  const [visible, setVisible] = useState(false);

  return (
    <View className="relative">
      <AuthFieldIcon>
        <Lock size={18} color={colors.textMuted} />
      </AuthFieldIcon>
      <Input
        value={value}
        onChangeText={onChange}
        placeholder={copy.loginPasswordPlaceholder}
        accessibilityLabel={copy.loginPasswordPlaceholder}
        secureTextEntry={!visible}
        textContentType="password"
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        className="h-12 rounded-xl border-border/60 bg-white pl-11 pr-11"
      />
      <Pressable
        onPress={() => setVisible((current) => !current)}
        className="absolute right-3 top-1/2 min-h-[44px] min-w-[44px] -translate-y-1/2 items-center justify-center"
        accessibilityRole="button"
        accessibilityLabel={copy.loginPasswordPlaceholder}>
        {visible ? (
          <EyeOff size={18} color={colors.textMuted} />
        ) : (
          <Eye size={18} color={colors.textMuted} />
        )}
      </Pressable>
    </View>
  );
}

type AuthOrDividerProps = {
  label?: string;
};

export function AuthOrDivider({ label }: AuthOrDividerProps) {
  const copy = useCopy();

  return (
    <View className="flex-row items-center gap-3">
      <View className="h-px flex-1 bg-border" />
      <Text className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label ?? copy.loginOrDivider}</Text>
      <View className="h-px flex-1 bg-border" />
    </View>
  );
}
