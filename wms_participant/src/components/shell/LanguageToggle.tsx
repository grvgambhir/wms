// EN | IT segmented language switch. Lives in the portal headers (RFP PLT-02).
// Reads/writes the app locale via the LocaleProvider; selection persists.
import { Pressable, View } from 'react-native';

import { Text } from '@/components/ui/text';
import { LOCALES, LOCALE_LABELS, useCopy, useLocale } from '@/i18n';
import { colors } from '@/theme/colors';

export function LanguageToggle() {
  const { locale, setLocale } = useLocale();
  const copy = useCopy();

  return (
    <View
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 999,
        overflow: 'hidden',
        alignSelf: 'flex-start',
      }}
    >
      {LOCALES.map((l) => {
        const active = l === locale;
        return (
          <Pressable
            key={l}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={copy.shellA11yLanguage.replace('{locale}', LOCALE_LABELS[l])}
            onPress={() => setLocale(l)}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 6,
              minHeight: 44,
              justifyContent: 'center',
              backgroundColor: active ? colors.primary : 'transparent',
            }}
          >
            <Text
              style={{
                color: active ? colors.primaryForeground : colors.textMuted,
                fontWeight: '700',
                fontSize: 13,
              }}
            >
              {LOCALE_LABELS[l]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
