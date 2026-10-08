// P19 — Change Impact Review (WS-C). The participant-side counterpart to A04: when
// the OC publishes a rule-register change (A04 → publishRuleChange), the affected
// participant sees the impact ON THEIR OWN ENTRY here and reviews it BEFORE commit —
// no silent reclassification (RUL-03/04). Cross-portal via the shared rules repository.
import { useMemo } from 'react';
import { AlertTriangle, CheckCircle2, Info, ShieldCheck } from 'lucide-react-native';
import { ActivityIndicator, Pressable, View } from 'react-native';

import { ParticipantPortalShell } from '@/components/shell/ParticipantPortalShell';
import { Text } from '@/components/ui/text';
import type { RosterMember, TeamCalcStrategy } from '@/domain/models/rule';
import { categoryImpact, deriveCategory } from '@/features/rules/engine';
import {
  useAcknowledgeRuleChange,
  useLatestRuleChange,
  useRuleForEvent,
} from '@/features/rules/hooks/useRules';
import { useCopy, type CopyDict } from '@/i18n';
import { colors } from '@/theme/colors';

// The participant's canonical demo doubles entry (illustrative — "your entry").
const MY_ROSTER: RosterMember[] = [
  { id: 'p1', name: 'Daniel Harper', dob: '1985-03-15' },
  { id: 'p2', name: 'Marco Rossi', dob: '1988-09-22' },
];

function strategyLabel(copy: CopyDict, strategy: TeamCalcStrategy): string {
  switch (strategy) {
    case 'youngest-member':
      return copy.rulesStrategyYoungestTitle;
    case 'crew-average':
      return copy.rulesStrategyCrewTitle;
    case 'relay-aggregate':
      return copy.rulesStrategyRelayTitle;
    default:
      return 'Individual';
  }
}

export default function ChangeImpactScreen() {
  const copy = useCopy();
  const change = useLatestRuleChange('Tennis', "Men's Doubles");
  const { data: rule } = useRuleForEvent('Tennis', "Men's Doubles");
  const acknowledge = useAcknowledgeRuleChange();

  const notice = change.data ?? null;
  const liveDerivation = useMemo(() => (rule ? deriveCategory(MY_ROSTER, rule) : null), [rule]);

  const impact = useMemo(() => {
    if (!notice || !rule || !liveDerivation) return null;
    if (notice.fromStrategy === notice.toStrategy) {
      return {
        changed: false,
        fromCategory: liveDerivation.categoryName,
        toCategory: liveDerivation.categoryName,
        fromBandingAge: liveDerivation.bandingAge,
        toBandingAge: liveDerivation.bandingAge,
        reason: 'Rule register updated by the OC',
      };
    }
    const before = deriveCategory(MY_ROSTER, { ...rule, strategy: notice.fromStrategy });
    const after = deriveCategory(MY_ROSTER, rule);
    return categoryImpact(before, after, 'Rule register updated by the OC');
  }, [notice, rule, liveDerivation]);

  const acknowledged = notice?.status === 'acknowledged';

  return (
    <ParticipantPortalShell activeId="entries">
      <Text style={{ color: colors.textMuted, fontSize: 13 }}>My Entries › {copy.p19Breadcrumb}</Text>
      <Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '800', color: colors.text, marginTop: 6 }}>{copy.p19Title}</Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 20 }}>{copy.p19Subtitle}</Text>

      {change.isLoading ? (
        <View style={{ paddingVertical: 40, alignItems: 'center', gap: 10 }}>
          <ActivityIndicator color={colors.primary} />
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.p19Loading}</Text>
        </View>
      ) : !notice ? (
        <View style={{ ...card, maxWidth: 560, alignItems: 'flex-start', gap: 8 }}>
          <Info size={22} color={colors.primary} />
          <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>{copy.p19Empty}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13 }}>{copy.p19EmptyHint}</Text>
        </View>
      ) : (
        <View style={{ maxWidth: 620, gap: 16 }}>
          {/* Notice */}
          <View style={{ ...card, gap: 6 }}>
            <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
              {copy.p19NoticeLine.replace('{from}', notice.fromVersion).replace('{to}', notice.toVersion)}
            </Text>
            {notice.fromStrategy !== notice.toStrategy ? (
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {copy.p19StrategyLine
                  .replace('{from}', strategyLabel(copy, notice.fromStrategy))
                  .replace('{to}', strategyLabel(copy, notice.toStrategy))}
              </Text>
            ) : null}
          </View>

          {/* Your entry + impact */}
          <View
            style={{
              ...card,
              borderColor: impact?.changed ? 'rgba(245,158,11,0.5)' : 'rgba(22,163,74,0.4)',
              backgroundColor: impact?.changed ? 'rgba(245,158,11,0.06)' : 'rgba(22,163,74,0.05)',
              gap: 12,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
              {copy.p19YourEntry}
            </Text>
            <Text style={{ color: colors.text, fontWeight: '700', fontSize: 15 }}>
              Tennis · Men's Doubles — {MY_ROSTER.map((m) => m.name).join(' / ')}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              {impact?.changed ? (
                <AlertTriangle size={18} color={colors.warning} />
              ) : (
                <CheckCircle2 size={18} color={colors.success} />
              )}
              <Text style={{ color: colors.text, fontWeight: '800', fontSize: 15 }}>
                {impact?.changed ? copy.p19ImpactChangedTitle : copy.p19ImpactSameTitle}
              </Text>
            </View>

            {impact ? (
              <View style={{ gap: 4 }}>
                <Text style={{ fontSize: 16 }}>
                  <Text style={{ color: colors.textMuted, textDecorationLine: impact.changed ? 'line-through' : 'none' }}>
                    {impact.fromCategory}
                  </Text>
                  <Text style={{ color: colors.textMuted }}>{'  →  '}</Text>
                  <Text style={{ color: impact.changed ? colors.primaryDark : colors.text, fontWeight: '800' }}>
                    {impact.toCategory}
                  </Text>
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  {copy.p19BandingAge
                    .replace('{from}', String(impact.fromBandingAge))
                    .replace('{to}', String(impact.toBandingAge))}
                </Text>
              </View>
            ) : null}

            <Text style={{ color: colors.textMuted, fontSize: 13 }}>
              {impact?.changed ? copy.p19FeeNote : copy.p19NoChangeNote}
            </Text>
          </View>

          {/* Audit note */}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-start' }}>
            <ShieldCheck size={15} color={colors.textMuted} />
            <Text style={{ flex: 1, color: colors.textMuted, fontSize: 12 }}>{copy.p19AuditNote}</Text>
          </View>

          {/* Acknowledge / result */}
          {acknowledged ? (
            <View style={{ ...card, borderColor: 'rgba(22,163,74,0.4)', backgroundColor: 'rgba(22,163,74,0.06)', gap: 6 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <CheckCircle2 size={18} color={colors.success} />
                <Text style={{ color: colors.text, fontWeight: '800' }}>{copy.p19AckedTitle}</Text>
              </View>
              <Text style={{ color: colors.textMuted, fontSize: 13 }}>
                {copy.p19AckedBody.replace('{category}', impact?.toCategory ?? '')}
              </Text>
            </View>
          ) : (
            <Pressable
              onPress={() => void acknowledge.mutateAsync(notice.id)}
              disabled={acknowledge.isPending}
              accessibilityRole="button"
              accessibilityLabel={acknowledge.isPending ? copy.p19Acknowledging : copy.p19Acknowledge}
              accessibilityState={{ disabled: acknowledge.isPending }}
              style={{ ...btnPrimary, opacity: acknowledge.isPending ? 0.6 : 1, minHeight: 44 }}
            >
              <Text style={{ color: colors.primaryForeground, fontWeight: '800', fontSize: 15 }}>
                {acknowledge.isPending ? copy.p19Acknowledging : copy.p19Acknowledge}
              </Text>
            </Pressable>
          )}
        </View>
      )}

      <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 24 }}>{copy.p19Disclaimer}</Text>
    </ParticipantPortalShell>
  );
}

const card = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  borderRadius: 14,
  padding: 18,
} as const;

const btnPrimary = {
  backgroundColor: colors.primary,
  borderRadius: 10,
  paddingVertical: 14,
  paddingHorizontal: 18,
  alignItems: 'center',
  alignSelf: 'flex-start',
} as const;
