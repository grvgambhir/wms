import { useEffect, useMemo, useState } from 'react';
import { History, Save, SlidersHorizontal, Trash2, TriangleAlert } from 'lucide-react';

import { AdminPortalShell } from '../components/layout/AdminPortalShell';
import { CategoryCheckerPanel } from '../components/rules/CategoryCheckerPanel';
import type { RuleImpactRow, SportRule, TeamCalcStrategy } from '../domain/rule';
import { deriveCategory } from '@wms/domain';
import { useRules } from '../hooks/useRules';

const strategies: Array<{ value: TeamCalcStrategy; title: string; description: string }> = [
  { value: 'youngest-member', title: 'Youngest Member Age', description: 'Category from the youngest player on the roster (e.g. Tennis, Basketball).' },
  { value: 'crew-average', title: 'Crew Average Age', description: 'Sum of member ages ÷ headcount, excluding coxswain (e.g. Rowing).' },
  { value: 'relay-aggregate', title: 'Aggregate Age Sum', description: 'Sums member ages into predefined total bands (e.g. Swimming Relay).' },
];

function bumpVersion(version: string): string {
  const match = version.match(/^v(\d+)\.(\d+)$/);
  return match ? `v${match[1]}.${Number(match[2]) + 1}` : `${version}.1`;
}

export function RulesConfiguratorPage() {
  const rules = useRules();
  const [draft, setDraft] = useState<SportRule | null>(null);
  const [impact, setImpact] = useState<RuleImpactRow[] | null>(null);
  useEffect(() => { if (rules.overview) setDraft(rules.overview.rule); }, [rules.overview]);
  const published = rules.overview?.rule;
  const dirty = Boolean(
    published &&
      draft &&
      (published.strategy !== draft.strategy || JSON.stringify(published.bands) !== JSON.stringify(draft.bands)),
  );
  const impactRows = useMemo(() => {
    if (!published || !draft || !rules.overview) return [];
    return rules.overview.registrations.map((registration) => {
      const before = deriveCategory(registration.roster, published);
      const after = deriveCategory(registration.roster, draft);
      return { registration, impact: { changed: before.categoryName !== after.categoryName, fromCategory: before.categoryName, toCategory: after.categoryName, fromBandingAge: before.bandingAge, toBandingAge: after.bandingAge, reason: 'Calculation strategy changed' } };
    }).filter((row) => row.impact.changed);
  }, [published, draft, rules.overview]);

  const confirmPublish = async () => {
    if (!published || !draft || !rules.overview) return;
    const response = await rules.publishRuleChange({
      sport: published.sport,
      event: published.event,
      fromVersion: published.version,
      toVersion: bumpVersion(published.version),
      fromStrategy: published.strategy,
      toStrategy: draft.strategy,
      affectedCount: impactRows.length,
      totalCount: rules.overview.registrations.length,
      bands: draft.bands,
      ruleSetId: rules.overview.ruleSetId,
      fromVersionId: rules.overview.versionId,
    });
    if (response) setImpact(null);
  };

  return <AdminPortalShell><div className="mx-auto max-w-[1500px]">
    {rules.isLoading || !published || !draft ? <div role="status" className="text-sm text-text-muted">Loading rule register…</div> : <>
      <header className="flex items-start gap-4"><div className="min-w-0 flex-1"><div className="flex items-center gap-2.5"><SlidersHorizontal aria-hidden size={22} className="text-primary" /><h1 className="text-2xl font-extrabold text-text">Masters Sport Rules Configurator</h1></div><p className="mt-1 text-sm text-text-muted">Configure age calculation formulas, crew rules, and eligibility logic by sport.</p></div><button type="button" disabled title="Version history is not wired yet" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border bg-surface px-3.5 text-[13px] font-semibold text-text-muted disabled:cursor-not-allowed"><History aria-hidden size={16} />Version History</button><button type="button" disabled={!dirty || rules.isPublishing} onClick={() => setImpact(impactRows)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-bold text-white disabled:cursor-not-allowed disabled:bg-surface-muted disabled:text-text-muted"><Save aria-hidden size={16} />Publish Rule Register</button></header>
      {rules.error ? <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900">{rules.error}</div> : null}
      <section className="mt-5 grid grid-cols-3 gap-4 rounded-xl border border-border bg-surface p-4 shadow-panel"><InfoField label="SELECTED SPORT / DISCIPLINE" value={`${draft.sport} · ${draft.event ?? ''}`} /><InfoField label="AGE CALCULATION REFERENCE DATE (RUL-02)" value="31 / 12 / 2027" /><div><h2 className="text-[11px] font-bold tracking-[0.05em] text-text-muted">EFFECTIVE RULE VERSION</h2><p className="mt-1.5 inline-block rounded-lg bg-success/10 px-3 py-2.5 font-bold text-success">{published.version} (Active in Production){dirty ? ` → ${bumpVersion(published.version)} (draft)` : ''}</p></div></section>
      <section className="mt-[18px] overflow-hidden rounded-xl border border-border bg-surface shadow-panel"><div className="flex items-center bg-admin-sidebar px-4 py-3.5"><h2 className="flex-1 text-[15px] font-extrabold text-white">Rule Pattern: Team Category Derivation</h2><span className="rounded-md bg-primary/25 px-2 py-1 text-[11px] font-bold text-blue-200">ACTIVE FORMULA</span></div><div className="space-y-4 p-4"><fieldset><legend className="font-bold text-text">Calculation Strategy</legend><div className="mt-3 grid grid-cols-3 gap-3">{strategies.map((strategy) => { const active = draft.strategy === strategy.value; return <button key={strategy.value} type="button" role="radio" aria-label={strategy.title} aria-checked={active} onClick={() => setDraft({ ...draft, strategy: strategy.value })} className={`rounded-xl border p-3.5 text-left ${active ? 'border-2 border-primary bg-primary/[0.06]' : 'border-border'}`}><strong className="text-sm text-text">{strategy.title}</strong><span className="mt-1.5 block text-xs leading-4 text-text-muted">{strategy.description}</span></button>; })}</div></fieldset>
      <div><div className="mb-2.5 flex items-center"><h3 className="flex-1 font-bold text-text">Defined Category Age Bands</h3><button type="button" disabled title="Custom bands are not wired yet" className="text-[13px] font-bold text-text-muted disabled:cursor-not-allowed">+ Add Custom Band</button></div><table className="w-full overflow-hidden rounded-[10px] border border-border text-sm"><thead className="bg-surface-muted text-[11px] tracking-[0.04em] text-text-muted"><tr><th className="p-2.5 text-left">CATEGORY NAME</th><th className="p-2.5 text-left">MIN AGE</th><th className="p-2.5 text-left">MAX AGE</th><th className="p-2.5 text-left">OPEN-ENDED?</th><th className="p-2.5 text-right"><span className="sr-only">Actions</span></th></tr></thead><tbody className="divide-y divide-border">{draft.bands.map((band) => <tr key={band.id}><td className="p-3 font-semibold text-text">{band.name}</td><td className="p-3"><input aria-label={`Minimum age for ${band.name}`} type="number" value={band.minAge} onChange={(event) => setDraft({ ...draft, bands: draft.bands.map((item) => item.id === band.id ? { ...item, minAge: Number(event.target.value) } : item) })} className="w-20 rounded border border-border px-2 py-1" /></td><td className="p-3"><input aria-label={`Maximum age for ${band.name}`} type="number" value={band.maxAge ?? ''} placeholder="open" onChange={(event) => setDraft({ ...draft, bands: draft.bands.map((item) => item.id === band.id ? { ...item, maxAge: event.target.value === '' ? null : Number(event.target.value) } : item) })} className="w-20 rounded border border-border px-2 py-1" /></td><td className={`p-3 ${band.maxAge == null ? 'font-bold text-success' : 'text-text-muted'}`}>{band.maxAge == null ? 'Yes (Open Upper)' : 'No'}</td><td className="p-3 text-right"><button type="button" disabled title="Band editing is not wired yet" aria-label={`Remove ${band.name}`} className="ml-auto inline-flex text-text-muted disabled:cursor-not-allowed"><Trash2 aria-hidden size={16} /></button></td></tr>)}</tbody></table></div>
      <div role="alert" className="flex gap-2 rounded-[10px] border border-warning/35 bg-warning/10 p-3 text-xs leading-[18px] text-amber-800"><TriangleAlert aria-hidden size={16} className="shrink-0" /><p><strong>Automated Impact Analysis Active (RUL-03): </strong>Publishing modifications will analyze affected active registrations, flag team reclassifications, and queue required participant notifications before committing changes.</p></div></div></section>
      <CategoryCheckerPanel />
      {impact !== null ? <ImpactDialog rows={impact} total={rules.overview!.registrations.length} fromVersion={published.version} toVersion={bumpVersion(published.version)} publishing={rules.isPublishing} onCancel={() => setImpact(null)} onConfirm={() => void confirmPublish()} /> : null}
    </>}
  </div></AdminPortalShell>;
}

function ImpactDialog({ rows, total, fromVersion, toVersion, publishing, onCancel, onConfirm }: { readonly rows: readonly RuleImpactRow[]; readonly total: number; readonly fromVersion: string; readonly toVersion: string; readonly publishing: boolean; readonly onCancel: () => void; readonly onConfirm: () => void }) {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-5"><section role="dialog" aria-modal="true" aria-labelledby="impact-title" className="w-full max-w-[560px] rounded-2xl bg-surface p-[22px] shadow-2xl"><h2 id="impact-title" className="text-lg font-extrabold text-text">Impact Analysis (RUL-03)</h2><p className="mt-3 text-sm text-text-muted"><strong className={rows.length ? 'text-amber-700' : 'text-success'}>{rows.length} of {total}</strong> active registration(s) will be reclassified by this change. Publishing bumps the rule register <strong className="text-text">{fromVersion} → {toVersion}</strong>.</p><div className="mt-3 max-h-[260px] space-y-2 overflow-y-auto">{rows.length === 0 ? <p className="text-sm text-text-muted">No active registrations are affected.</p> : rows.map(({ registration, impact }) => <article key={registration.id} className="rounded-[10px] border border-border p-3"><h3 className="font-bold text-text">{registration.id} · {registration.team}</h3><p className="mt-1 text-[13px] text-text-muted">{impact.fromCategory} → <strong className="text-primary">{impact.toCategory}</strong> <span className="ml-2">(band age {impact.fromBandingAge} → {impact.toBandingAge})</span></p></article>)}</div><p className="mt-3 text-xs text-text-muted">The original registration category is preserved for audit (RUL-04); affected participants are queued for notification (RUL-05).</p><div className="mt-4 flex justify-end gap-2.5"><button type="button" onClick={onCancel} disabled={publishing} className="min-h-11 rounded-lg border border-border px-4 font-semibold">Cancel</button><button type="button" onClick={onConfirm} disabled={publishing} className="min-h-11 rounded-lg bg-primary px-4 font-bold text-white disabled:opacity-60">{publishing ? 'Publishing…' : 'Confirm & Publish'}</button></div></section></div>;
}
function InfoField({ label, value }: { readonly label: string; readonly value: string }) { return <div><h2 className="text-[11px] font-bold tracking-[0.05em] text-text-muted">{label}</h2><p className="mt-1.5 rounded-lg border border-border px-3 py-2.5 font-semibold text-text">{value}</p></div>; }
