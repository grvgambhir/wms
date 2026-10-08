import { useEffect, useRef, useState } from 'react';
import { Platform, Pressable, TextInput, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';
import { glass } from '@/theme/glass';

type OtpInputProps = {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  /** Auto-open keyboard on mount — enabled on iOS/Android only. */
  autoFocus?: boolean;
  variant?: 'glass' | 'outline';
  accessibilityLabel?: string;
  /** Called on Enter/Return (web) or the keyboard's submit key (native) — wire this to the screen's submit action. */
  onSubmit?: () => void;
};

/** Blinking caret shown in the active empty OTP cell. */
function BlinkingCaret() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const interval = setInterval(() => setVisible((current) => !current), 500);
    return () => clearInterval(interval);
  }, []);

  if (!visible) {
    return <View className="h-6 w-0.5" />;
  }

  return <View className="h-6 w-0.5 rounded-full bg-primary" />;
}

/** Six-digit OTP entry — glass cells with active-state ring and mobile auto-focus. */
export function OtpInput({
  length = 6,
  value,
  onChange,
  className,
  autoFocus = Platform.OS !== 'web',
  variant = 'glass',
  accessibilityLabel = 'One-time password',
  onSubmit,
}: OtpInputProps) {
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);
  const digits = value.padEnd(length, ' ').slice(0, length).split('');
  const activeIndex = Math.min(value.length, length - 1);

  useEffect(() => {
    if (!autoFocus) return;

    const timer = setTimeout(() => inputRef.current?.focus(), 350);
    return () => clearTimeout(timer);
  }, [autoFocus]);

  const updateValue = (next: string) => {
    onChange(next.replace(/\D/g, '').slice(0, length));
  };

  return (
    <View className={cn('gap-2', className)}>
      <Pressable
        onPress={() => inputRef.current?.focus()}
        accessibilityRole="none"
        className="flex-row justify-between gap-2">
        {digits.map((digit, index) => {
          const isActive = isFocused && index === activeIndex && value.length < length;
          const hasDigit = Boolean(digit.trim());

          const isOutline = variant === 'outline';

          return (
            <View
              key={index}
              className={cn(
                'h-14 flex-1 items-center justify-center rounded-xl border-2',
                isOutline ? 'border-border bg-white' : '',
              )}
              style={
                isOutline
                  ? { borderColor: isActive ? colors.primary : colors.border }
                  : {
                      backgroundColor: glass.backgroundStrong,
                      borderColor: isActive || (isFocused && hasDigit && index === value.length - 1) ? colors.primary : glass.borderSubtle,
                      shadowColor: isActive ? glass.shadow : 'transparent',
                      shadowOffset: { width: 0, height: 4 },
                      shadowOpacity: isActive ? 1 : 0,
                      shadowRadius: 8,
                    }
              }>
              {hasDigit ? (
                <Text className="text-xl font-bold text-foreground">{digit}</Text>
              ) : isActive ? (
                <BlinkingCaret />
              ) : (
                <Text className="text-xl font-bold text-foreground"> </Text>
              )}
            </View>
          );
        })}
      </Pressable>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={updateValue}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus={autoFocus}
        caretHidden
        maxLength={length}
        returnKeyType="done"
        onSubmitEditing={onSubmit}
        className="absolute h-px w-px opacity-0"
        accessibilityLabel={accessibilityLabel}
      />
    </View>
  );
}
