import { useState } from 'react';
import { AlertTriangle, CheckCircle2, ClipboardCheck, History, Play, Send, ShieldCheck, UserCheck, Users } from 'lucide-react';

import { AdminPortalShell } from '../components/layout/AdminPortalShell';
import { KpiCard } from '../components/operations/KpiCard';
import type { AssistedAuditAction, AssistedConsentMethod, AssistedParticipant, AssistedRegistrationSession, ProxyAuditEntry } from '../domain/assistedRegistration';
import { newIdempotencyKey } from '../api/idempotencyKey';
import { useAssistedRegistration } from '../hooks/useAssistedRegistration';

const consentMethods: readonly AssistedConsentMethod[] = ['phone', 'in_person', 'email'];
const consentLabels: Record<AssistedConsentMethod, string> = { phone: 'Phone', in_person: 'In person', email: 'Email' };
const auditLabels: Record<AssistedAuditAction, string> = {
  consent_recorded: 'Participant consented — captured by operator',
  registration_started: 'Registration started on behalf',
  registration_submitted: 'Registration submitted on behalf',
};
function statusLabel(session?: AssistedRegistrationSession): string {
  if (!session || session.registrationStatus === 'not_started') return 'NOT STARTED';
  return session.registrationStatus === 'draft' ? 'DRAFT' : 'SUBMITTED';
}

export function AssistedRegistrationPage() {
  const assisted = useAssistedRegistration();
  const [participantId, setParticipantId] = useState<string | null>(null);
  const [consentMethod, setConsentMethod] = useState<AssistedConsentMethod>('phone');
  const operator = assisted.overview?.operator;
  const participant = assisted.overview?.participants.items.find((item) => item.id === participantId);
  const session = assisted.overview?.sessions.items.find((item) => item.participantId === participantId);

  const recordConsent = () => {
    if (!operator || !participant) return;
    void assisted.recordConsent({ participantId: participant.id, operatorId: operator.id, method: consentMethod, idempotencyKey: newIdempotencyKey() });
  };
  const proxyAction = () => {
    if (!operator || !participant) return;
    const action = session?.registrationStatus === 'draft' ? 'registration_submitted' : 'registration_started';
    void assisted.performProxyAction({ participantId: participant.id, operatorId: operator.id, action, idempotencyKey: newIdempotencyKey() });
  };

  return (
    <AdminPortalShell userName={operator?.name} role="Helpdesk operator">
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4 flex items-start gap-2.5"><UserCheck aria-hidden size={22} className="mt-0.5 text-primary" /><div><h1 className="text-2xl font-extrabold text-text">Assisted Registration</h1><p className="mt-1 text-sm text-text-muted">Register or act for a participant with recorded consent and a clear operator audit.</p></div></div>
        {assisted.isLoading ? <LoadingState /> : !assisted.overview ? <ErrorState message={assisted.error} onRetry={() => void assisted.reload()} /> : (
          <>
            {assisted.error ? <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900">{assisted.error}</div> : null}
            <div className="grid grid-cols-3 gap-3.5">
              <KpiCard accent="#4887CA" label="AVAILABLE PARTICIPANTS" value={String(assisted.overview.participants.total)} detail="Canonical participant records" />
              <KpiCard accent="#16A34A" label="CONSENT RECORDED" value={String(assisted.overview.sessions.items.filter((item) => item.consent).length)} detail="Participants cleared for proxy action" />
              <KpiCard accent="#F59E0B" label="AUDIT EVENTS" value={String(assisted.overview.auditTrail.total)} detail="Immutable operator actions" />
            </div>
            <div className="mt-[18px] grid grid-cols-2 items-start gap-4">
              <div className="space-y-4">
                <Panel title="1. Select participant" icon={<Users aria-hidden size={17} />}>
                  <p className="mb-3 text-xs text-text-muted">Choose the person you are authorised to assist.</p>
                  <div role="radiogroup" aria-label="Participants" className="space-y-2">
                    {assisted.overview.participants.items.map((item) => <ParticipantRow key={item.id} participant={item} selected={item.id === participantId} status={statusLabel(assisted.overview?.sessions.items.find((value) => value.participantId === item.id))} onSelect={() => setParticipantId(item.id)} />)}
                  </div>
                </Panel>
                <Panel title="2. Record consent" icon={<ShieldCheck aria-hidden size={17} />}>
                  {!participant ? <EmptyPrompt /> : session?.consent ? (
                    <div role="status" className="rounded-[10px] border border-success/30 bg-success/[0.08] p-3 text-xs">
                      <p className="flex items-center gap-1.5 font-extrabold text-success"><CheckCircle2 aria-hidden size={16} />Participant consented — captured by operator</p>
                      <p className="mt-1.5 text-text-muted">Method: {consentLabels[session.consent.method]}</p><p className="mt-1 text-text-muted">Consent reference: {session.consent.reference}</p><p className="mt-1 text-text-muted">Captured by {session.consent.capturedByOperatorName}</p>
                    </div>
                  ) : (
                    <><p className="text-xs text-text-muted">Participant consented — captured by operator. Select how consent was provided.</p><fieldset className="mt-3"><legend className="text-xs font-bold text-text">Consent method</legend><div className="mt-2 flex gap-2">{consentMethods.map((method) => <button key={method} type="button" role="radio" aria-checked={method === consentMethod} onClick={() => setConsentMethod(method)} className={`min-h-11 rounded-full border px-3 text-xs font-bold ${method === consentMethod ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text'}`}>{consentLabels[method]}</button>)}</div></fieldset><button type="button" onClick={recordConsent} disabled={assisted.isMutating} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white disabled:opacity-60"><ClipboardCheck aria-hidden size={15} />{assisted.isMutating ? 'Recording consent…' : 'Record participant consent'}</button></>
                  )}
                </Panel>
                <Panel title="3. Proxy action" icon={<Play aria-hidden size={17} />}>
                  {!participant ? <EmptyPrompt /> : <><div className="flex items-center justify-between"><span className="text-xs text-text-muted">Registration status</span><strong className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] text-text">{statusLabel(session)}</strong></div>{!session?.consent ? <div role="alert" className="mt-3 flex gap-2 rounded-lg border border-warning/35 bg-warning/[0.08] p-2.5 text-xs text-amber-800"><AlertTriangle aria-hidden size={16} /><span><strong className="block">Consent required</strong>Proxy action is blocked until this participant’s consent is recorded.</span></div> : null}{session?.registrationStatus === 'submitted' ? <p role="status" className="mt-3 flex items-center gap-1.5 text-[13px] font-bold text-success"><CheckCircle2 aria-hidden size={16} />Registration submitted on the participant’s behalf.</p> : <button type="button" onClick={proxyAction} disabled={!session?.consent || assisted.isMutating} className="mt-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-[13px] font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45">{session?.registrationStatus === 'draft' ? <Send aria-hidden size={15} /> : <Play aria-hidden size={15} />}{session?.registrationStatus === 'draft' ? 'Submit registration on behalf' : 'Start registration on behalf'}</button>}</>}
                </Panel>
              </div>
              <Panel title="Audit trail" icon={<History aria-hidden size={17} />}>
                <p className="mb-3 text-xs text-text-muted">Newest first · every event links the operator, participant, consent and timestamp.</p>
                <div aria-label="Proxy audit trail" className="space-y-2.5">{assisted.overview.auditTrail.items.map((entry) => <AuditRow key={entry.id} entry={entry} />)}</div>
              </Panel>
            </div>
            <p className="mt-5 text-[11px] text-text-muted">Illustrative helpdesk workflow. No real registration, consent notice or authentication is submitted in this POC.</p>
          </>
        )}
      </div>
    </AdminPortalShell>
  );
}

function ParticipantRow({ participant, selected, status, onSelect }: { readonly participant: AssistedParticipant; readonly selected: boolean; readonly status: string; readonly onSelect: () => void }) {
  return <button type="button" role="radio" aria-checked={selected} aria-label={`Select participant ${participant.firstName} ${participant.lastName}`} onClick={onSelect} className={`flex min-h-16 w-full items-center gap-2.5 rounded-[10px] border p-3 text-left ${selected ? 'border-primary bg-primary/[0.08]' : 'border-border'}`}><span className={`grid h-9 w-9 place-items-center rounded-lg text-xs font-extrabold ${selected ? 'bg-primary text-white' : 'bg-surface-muted text-text'}`}>{participant.firstName[0]}{participant.lastName[0]}</span><span className="min-w-0 flex-1"><strong className="block text-sm text-text">{participant.firstName} {participant.lastName}</strong><span className="block text-[11px] text-text-muted">{participant.email} · {participant.nationalityCountryCode}</span></span><span className={`text-[10px] font-extrabold ${selected ? 'text-primary' : 'text-text-muted'}`}>{status}</span></button>;
}
function AuditRow({ entry }: { readonly entry: ProxyAuditEntry }) {
  const timestamp = new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Rome' }).format(new Date(entry.occurredAt));
  return <article className={`rounded-[10px] border border-border border-l-[3px] p-3 ${entry.action === 'consent_recorded' ? 'border-l-success' : 'border-l-primary'}`}><div className="flex items-center justify-between gap-2"><h3 className="text-[13px] font-extrabold text-text">{auditLabels[entry.action]}</h3><span className="rounded-full bg-surface-muted px-2 py-1 text-[10px] font-extrabold text-text-muted">OPERATOR ACTION</span></div><p className="mt-1.5 text-[11px] text-text-muted">Acted by: {entry.operatorName}</p><p className="mt-1 text-[11px] text-text-muted">On behalf of: {entry.participantName}</p><p className="mt-1 text-[11px] text-text-muted">Consent reference: {entry.consentReference}</p><time className="mt-1 block text-[10px] text-text-muted">{timestamp}</time></article>;
}
function Panel({ title, icon, children }: { readonly title: string; readonly icon: React.ReactNode; readonly children: React.ReactNode }) {
  return <section className="rounded-xl border border-border bg-surface p-4 shadow-panel"><h2 className="mb-3 flex items-center gap-2 text-[15px] font-extrabold text-text"><span className="text-primary">{icon}</span>{title}</h2>{children}</section>;
}
function EmptyPrompt() { return <p className="rounded-[10px] bg-surface-muted p-3 text-xs text-text-muted">Select a participant to continue.</p>; }
function LoadingState() { return <div role="status" className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel">Loading assisted sessions…</div>; }
function ErrorState({ message, onRetry }: { readonly message: string | null; readonly onRetry: () => void }) { return <div role="alert" className="grid min-h-64 place-items-center rounded-xl border border-danger/30 bg-surface p-8 text-center shadow-panel"><div><p className="font-bold text-text">Could not load assisted-registration sessions.</p>{message ? <p className="mt-1 text-sm text-text-muted">{message}</p> : null}<button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white">Try again</button></div></div>; }
