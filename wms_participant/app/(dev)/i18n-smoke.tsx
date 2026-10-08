// Dev smoke screen for the i18n scaffold (WS-A, RFP PLT-02).
// Open `/i18n-smoke`, tap EN|IT — the sample strings switch language live, and the
// choice persists across reloads. Proves the LocaleProvider + useCopy() wiring
// without touching production screens. Not part of the participant/admin flow.
import { ScrollView, View } from 'react-native';

import { LanguageToggle } from '@/components/shell/LanguageToggle';
import { Text } from '@/components/ui/text';
import { useCopy, useLocale, type CopyKey } from '@/i18n';
import { colors } from '@/theme/colors';

const SAMPLE_KEYS: CopyKey[] = [
  'loginTitle',
  'loginSubtitle',
  'loginTabLogin',
  'loginTabSignUp',
  'loginIdentifierLabel',
  'loginForgotPassword',
  'continue',
  'verify',
  'searchSports',
  'registrationOpen',
  'quotaAvailable',
  'quotaWaitlist',
  'eventLive',
  'featuredEvent',
];

export default function I18nSmokeScreen() {
  const copy = useCopy();
  const { locale } = useLocale();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, gap: 16 }}
    >
      <Text style={{ fontSize: 22, fontWeight: '800', color: colors.text }}>
        i18n scaffold — EN / IT
      </Text>
      <Text style={{ color: colors.textMuted }}>
        Current locale: {locale.toUpperCase()} · tap to switch (persists across reloads).
        Missing Italian keys fall back to English.
      </Text>

      <LanguageToggle />

      <View
        style={{
          marginTop: 8,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: 12,
          backgroundColor: colors.surface,
          overflow: 'hidden',
        }}
      >
        {SAMPLE_KEYS.map((key, i) => (
          <View
            key={key}
            style={{
              flexDirection: 'row',
              gap: 12,
              paddingVertical: 10,
              paddingHorizontal: 14,
              borderTopWidth: i === 0 ? 0 : 1,
              borderTopColor: colors.border,
            }}
          >
            <Text style={{ width: 150, color: colors.textMuted, fontSize: 12 }}>{key}</Text>
            <Text style={{ flex: 1, color: colors.text, fontWeight: '600' }}>{copy[key]}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
