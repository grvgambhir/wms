// Dev screen for the Masters rules engine (WS-B). Open `/rules-smoke`: it derives
// categories for the RFP §3.2 patterns against the 31 Dec 2027 reference date and
// checks each against an expected value (PASS/FAIL chip) — a visible unit check.
// The tennis card is interactive: "Add younger player" recalculates the category
// and surfaces the RUL-03 change impact (no silent reclassification).
import { type ReactNode, useMemo, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { Text } from '@/components/ui/text';
import type { RosterMember, SportRule } from '@/domain/models/rule';
import { categoryImpact, deriveCategory, DEFAULT_REFERENCE_DATE } from '@/features/rules/engine';
import { useSportRules } from '@/features/rules/hooks/useRules';
import { colors } from '@/theme/colors';

const DANIEL: RosterMember = { id: 'daniel', name: 'Daniel Harper', dob: '1985-03-15', role: 'captain' };
const MARCO: RosterMember = { id: 'marco', name: 'Marco Rossi', dob: '1988-09-22', role: 'partner' };
const YOUNGSTER: RosterMember = { id: 'luca', name: 'Luca Bianchi (new)', dob: '1994-06-10', role: 'partner' };

const ROWING_CREW: RosterMember[] = [
  { id: 'r1', name: 'Rower 1', dob: '1982-06-01' }, // 45
  { id: 'r2', name: 'Rower 2', dob: '1979-04-10' }, // 48
  { id: 'r3', name: 'Rower 3', dob: '1983-08-20' }, // 44
  { id: 'r4', name: 'Rower 4', dob: '1980-02-15' }, // 47
  { id: 'cox', name: 'Coxswain', dob: '1997-05-05', role: 'coxswain' }, // 30 — excluded
];

const RELAY_TEAM: RosterMember[] = [
  { id: 's1', name: 'Swimmer 1', dob: '1985-03-15' }, // 42
  { id: 's2', name: 'Swimmer 2', dob: '1988-09-22' }, // 39
  { id: 's3', name: 'Swimmer 3', dob: '1982-06-01' }, // 45
  { id: 's4', name: 'Swimmer 4', dob: '1977-01-01' }, // 50 → sum 176
];

function ruleFor(rules: SportRule[] | undefined, sport: string, event: string): SportRule | undefined {
  return (rules ?? []).find(
    (item) =>
      item.sport.toLowerCase() === sport.toLowerCase() &&
      (item.event?.toLowerCase() ?? '') === event.toLowerCase(),
  );
}

function Chip({ ok }: { ok: boolean }) {
  return (
    <View
      style={{
        borderRadius: 999,
        paddingHorizontal: 10,
        paddingVertical: 3,
        backgroundColor: ok ? 'rgba(22,163,74,0.12)' : 'rgba(220,38,38,0.12)',
      }}
    >
      <Text style={{ color: ok ? colors.success : colors.danger, fontWeight: '800', fontSize: 12 }}>
        {ok ? 'PASS' : 'FAIL'}
      </Text>
    </View>
  );
}

function ScenarioCard({
  title,
  rule,
  roster,
  expected,
  children,
}: {
  title: string;
  rule: SportRule | undefined;
  roster: RosterMember[];
  expected: string;
  children?: ReactNode;
}) {
  const derivation = useMemo(() => (rule ? deriveCategory(roster, rule) : null), [rule, roster]);
  if (!rule || !derivation) {
    return (
      <View style={cardStyle}>
        <Text style={{ color: colors.danger }}>Rule not found for {title}</Text>
      </View>
    );
  }
  const ok = derivation.categoryName === expected;
  return (
    <View style={cardStyle}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <Text style={{ flex: 1, fontWeight: '800', fontSize: 16, color: colors.text }}>{title}</Text>
        <Chip ok={ok} />
      </View>
      <Text style={{ color: colors.textMuted, fontSize: 12 }}>
        {rule.sport}
        {rule.event ? ` · ${rule.event}` : ''} · {rule.strategy} · ref {rule.referenceDate} · {rule.version}
      </Text>

      <View style={{ marginTop: 10, gap: 3 }}>
        {derivation.memberAges.map((m) => (
          <Text key={m.id} style={{ fontSize: 13, color: m.excluded ? colors.textMuted : colors.text }}>
            {m.excluded ? '—' : '•'} {m.name}: age {m.age}
            {m.excluded ? '  (excluded)' : ''}
          </Text>
        ))}
      </View>

      <View
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          gap: 2,
        }}
      >
        <Text style={{ fontSize: 13, color: colors.textMuted }}>
          Banding age: <Text style={{ color: colors.text, fontWeight: '700' }}>{derivation.bandingAge}</Text>
          {derivation.note ? `  · ${derivation.note}` : ''}
        </Text>
        <Text style={{ fontSize: 15 }}>
          Derived category:{' '}
          <Text style={{ color: colors.primary, fontWeight: '800' }}>{derivation.categoryName}</Text>
        </Text>
        <Text style={{ fontSize: 12, color: colors.textMuted }}>Expected: {expected}</Text>
      </View>

      {children}
    </View>
  );
}

const cardStyle = {
  borderWidth: 1,
  borderColor: colors.border,
  backgroundColor: colors.surface,
  borderRadius: 12,
  padding: 16,
  marginBottom: 14,
} as const;

export default function RulesSmokeScreen() {
  const { data: rules, isLoading, isError, error } = useSportRules();
  const [tennisRoster, setTennisRoster] = useState<RosterMember[]>([DANIEL, MARCO]);

  const tennisRule = ruleFor(rules, 'Tennis', "Men's Doubles");
  const swimRule = ruleFor(rules, 'Swimming', '100m Freestyle');
  const rowingRule = ruleFor(rules, 'Rowing', 'Coxed Four');
  const relayRule = ruleFor(rules, 'Swimming', '4×50 Freestyle Relay');
  const tennisImpact = useMemo(() => {
    if (!tennisRule) return null;
    const base = deriveCategory([DANIEL, MARCO], tennisRule);
    const now = deriveCategory(tennisRoster, tennisRule);
    return categoryImpact(base, now, 'Added a younger partner to the roster');
  }, [tennisRule, tennisRoster]);

  const youngerAdded = tennisRoster.length > 2;

  if (isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
        <Text style={{ color: colors.textMuted }}>Loading rule register…</Text>
      </View>
    );
  }

  if (isError) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, padding: 20 }}>
        <Text style={{ color: colors.danger, fontWeight: '800' }}>Live rule register could not be loaded.</Text>
        <Text style={{ color: colors.textMuted, marginTop: 8 }}>
          {error instanceof Error ? error.message : 'Sign in so GET /v1/rules can run. There is no JSON fallback.'}
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
    >
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>
        Masters Rules Engine — WS-B
      </Text>
      <Text style={{ color: colors.textMuted, marginTop: 4, marginBottom: 16 }}>
        Categories derived against the {DEFAULT_REFERENCE_DATE} reference date (RUL-02). Each card
        checks the engine against an expected value.
      </Text>

      <ScenarioCard
        title="1 · Swimming — individual age band"
        rule={swimRule}
        roster={[DANIEL]}
        expected="40–44"
      />

      <ScenarioCard
        title="2 · Tennis — youngest-member (doubles)"
        rule={tennisRule}
        roster={tennisRoster}
        expected={youngerAdded ? "Men's Doubles 30–34" : "Men's Doubles 35–39"}
      >
        <View style={{ marginTop: 12, gap: 8 }}>
          <Pressable
            onPress={() =>
              setTennisRoster((r) => (r.length > 2 ? [DANIEL, MARCO] : [DANIEL, MARCO, YOUNGSTER]))
            }
            style={{
              alignSelf: 'flex-start',
              backgroundColor: colors.primary,
              borderRadius: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
            }}
          >
            <Text style={{ color: colors.primaryForeground, fontWeight: '700', fontSize: 13 }}>
              {youngerAdded ? 'Remove younger player' : 'Add younger player (age 33)'}
            </Text>
          </Pressable>
          {tennisImpact && tennisImpact.changed ? (
            <View
              style={{
                borderRadius: 10,
                padding: 12,
                backgroundColor: 'rgba(245,158,11,0.10)',
                borderWidth: 1,
                borderColor: 'rgba(245,158,11,0.35)',
              }}
            >
              <Text style={{ color: '#92600A', fontWeight: '700', fontSize: 13 }}>
                RUL-03 impact: category {tennisImpact.fromCategory} → {tennisImpact.toCategory}
              </Text>
              <Text style={{ color: '#92600A', fontSize: 12, marginTop: 2 }}>
                {tennisImpact.reason} (banding age {tennisImpact.fromBandingAge} → {tennisImpact.toBandingAge}).
                Recalculated live, with audit — no silent reclassification.
              </Text>
            </View>
          ) : null}
        </View>
      </ScenarioCard>

      <ScenarioCard
        title="3 · Rowing — crew average (excl. coxswain)"
        rule={rowingRule}
        roster={ROWING_CREW}
        expected="Category C (43+)"
      />

      {relayRule ? (
        <ScenarioCard
          title="4 · Swimming — relay aggregate age"
          rule={relayRule}
          roster={RELAY_TEAM}
          expected="160–199"
        />
      ) : null}
    </ScrollView>
  );
}
