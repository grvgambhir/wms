// P — Help & support. A content screen: the questions participants actually ask
// (category derivation, rule changes, accreditation, waitlist, proxy registration)
// answered in the same terms the rest of the portal uses, plus how to reach the OC.
import { Clock, Mail, Phone } from 'lucide-react-native';
import { View } from 'react-native';

import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import { useCopy, type CopyDict } from '@/i18n';
import { colors } from '@/theme/colors';

/** One contact line — icon is decorative, the label/value pair carries the meaning. */
function ContactRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <View
      className="flex-row items-center gap-3 border-b border-border/60 py-2.5"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value}`}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
        {icon}
      </View>
      <Text
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        aria-hidden
        className="flex-1 text-[13px] text-muted-foreground"
      >
        {label}
      </Text>
      <Text
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
        aria-hidden
        className="text-[13px] font-semibold text-foreground"
      >
        {value}
      </Text>
    </View>
  );
}

function Faq({ question, answer }: { question: string; answer: string }) {
  return (
    <View
      className="rounded-2xl border border-border bg-card p-4"
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${question} ${answer}`}
    >
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden aria-hidden>
        <Text className="text-[14px] font-bold text-foreground">{question}</Text>
        <Text className="mt-1.5 text-[13px] leading-5 text-muted-foreground">{answer}</Text>
      </View>
    </View>
  );
}

export default function HelpScreen() {
  const copy: CopyDict = useCopy();

  const faqs = [
    { q: copy.helpQ1, a: copy.helpA1 },
    { q: copy.helpQ2, a: copy.helpA2 },
    { q: copy.helpQ3, a: copy.helpA3 },
    { q: copy.helpQ4, a: copy.helpA4 },
    { q: copy.helpQ5, a: copy.helpA5 },
  ];

  return (
    <ParticipantPortalShell activeId="help">
      <View className="gap-4">
        <View className="gap-1">
          <Text accessibilityRole="header" className="text-2xl font-extrabold text-foreground">
            {copy.helpTitle}
          </Text>
          <Text className="text-[13px] text-muted-foreground">{copy.helpSubtitle}</Text>
        </View>

        <View className="rounded-2xl border border-border bg-card p-5">
          <Text accessibilityRole="header" className="text-base font-bold text-foreground">
            {copy.helpContactHeading}
          </Text>
          <Text className="mt-1 text-[13px] text-muted-foreground">{copy.helpContactBody}</Text>
          <View className="mt-3">
            <ContactRow
              icon={<Mail size={15} color={colors.primary} />}
              label={copy.helpEmailLabel}
              value={copy.helpEmailValue}
            />
            <ContactRow
              icon={<Phone size={15} color={colors.primary} />}
              label={copy.helpPhoneLabel}
              value={copy.helpPhoneValue}
            />
            <ContactRow
              icon={<Clock size={15} color={colors.primary} />}
              label={copy.helpHoursLabel}
              value={copy.helpHoursValue}
            />
          </View>
        </View>

        <Text accessibilityRole="header" className="mt-1 text-base font-bold text-foreground">
          {copy.helpFaqHeading}
        </Text>
        <View className="gap-2.5">
          {faqs.map((item) => (
            <Faq key={item.q} question={item.q} answer={item.a} />
          ))}
        </View>
      </View>
    </ParticipantPortalShell>
  );
}
