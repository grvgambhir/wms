import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { useCopy } from '@/i18n';
import { cn } from '@/lib/utils';

export type AuthMode = 'login' | 'signup';

type AuthModeTabsProps = {
  value: AuthMode;
  onChange: (mode: AuthMode) => void;
};

/** A01 segmented control — Log In vs Sign Up. */
export function AuthModeTabs({ value, onChange }: AuthModeTabsProps) {
  const copy = useCopy();

  return (
    <View accessibilityRole="tablist" className="flex-row rounded-full bg-muted p-1">
      {(['login', 'signup'] as const).map((mode) => {
        const active = value === mode;
        const label = mode === 'login' ? copy.loginTabLogin : copy.loginTabSignUp;
        return (
          <Pressable
            key={mode}
            onPress={() => onChange(mode)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={label}
            className={cn('flex-1 items-center rounded-full py-2.5 min-h-[44px] justify-center', active && 'bg-primary shadow-sm')}>
            <Text className={cn('text-sm font-semibold', active ? 'text-primary-foreground' : 'text-foreground')}>
              {label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
