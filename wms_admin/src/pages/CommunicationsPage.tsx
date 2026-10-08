import { useMemo, useState } from 'react';
import { AlertTriangle, Mail, MessageSquare, Send, Smartphone, Users } from 'lucide-react';

import { AdminPortalShell } from '../components/layout/AdminPortalShell';
import { KpiCard } from '../components/operations/KpiCard';
import { Panel } from '../components/operations/Panel';
import type {
  CommsAudienceId,
  CommsChannel,
  CommunicationRecord,
  MessageTemplate,
} from '../domain/communications';
import { useCommunications } from '../hooks/useCommunications';

const channels: readonly CommsChannel[] = ['email', 'in-app', 'both'];
function audienceLabel(id: string): string {
  return (audienceLabels as Record<string, string>)[id] ?? id;
}

const audienceLabels: Record<CommsAudienceId, string> = {
  'all-participants': 'All participants',
  'pending-payment': 'Pending payment',
  'incomplete-documents': 'Incomplete documents',
  confirmed: 'Confirmed entries',
  tennis: 'Tennis',
  rowing: 'Rowing',
};
const channelLabels: Record<CommsChannel, string> = {
  email: 'Email',
  'in-app': 'In-app',
  both: 'Email + in-app',
};

function newComposeKey(): string {
  return `broadcast-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function CommunicationsPage() {
  const communications = useCommunications();
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [audienceId, setAudienceId] = useState('all-participants');
  const [channel, setChannel] = useState<CommsChannel>('email');
  const [composeKey, setComposeKey] = useState(newComposeKey);
  const [success, setSuccess] = useState<string | null>(null);

  const templates = communications.overview?.templates ?? [];
  const segments = communications.overview?.segments ?? [];
  const selectedTemplate = useMemo(
    () => templates.find((template) => template.id === templateId) ?? null,
    [templateId, templates],
  );
  const recipientCount = segments.find((segment) => segment.id === audienceId)?.recipientCount ?? 0;

  const applyTemplate = (template: MessageTemplate) => {
    setTemplateId(template.id);
    setSubject(template.subjectEn);
    setAudienceId(template.defaultAudienceId);
    setChannel(template.channel);
    setSuccess(null);
  };

  const useCustomMessage = () => {
    setTemplateId(null);
    setSubject('');
    setSuccess(null);
  };

  const sendBroadcast = async () => {
    const trimmedSubject = subject.trim();
    if (!trimmedSubject) return;
    const response = await communications.sendBroadcast({
      ...(templateId ? { templateId } : {}),
      subject: trimmedSubject,
      audienceId,
      channel,
      idempotencyKey: composeKey,
    });
    if (!response) return;
    setSuccess(`Broadcast sent to ${response.record.recipientCount.toLocaleString('en-GB')} participants.`);
    setTemplateId(null);
    setSubject('');
    setComposeKey(newComposeKey());
  };

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1500px]">
        <header className="mb-4">
          <div className="flex items-center gap-2.5">
            <Send aria-hidden size={22} className="text-primary" />
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">Communications Center</h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">Send segmented broadcasts to participants and track delivery.</p>
        </header>

        {communications.isLoading || !communications.overview ? (
          communications.error ? <ErrorState message={communications.error} onRetry={() => void communications.reload()} /> : <p role="status" className="py-12 text-center text-sm text-text-muted">Loading communications…</p>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-3.5">
              <KpiCard accent="#4887CA" label="BROADCASTS SENT" value={String(communications.overview.summary.sentCount)} detail={`${communications.overview.summary.sentCount} sent to date`} />
              <KpiCard accent="#16A34A" label="RECIPIENTS REACHED" value={communications.overview.summary.totalRecipients.toLocaleString('en-GB')} detail="across all broadcasts" />
              <KpiCard accent="#0EA5E9" label="TEMPLATES" value={String(communications.overview.summary.templateCount)} detail={`${communications.overview.summary.templateCount} reusable templates`} />
            </div>

            {communications.error ? <div role="alert" className="mt-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900">{communications.error}</div> : null}
            {success ? <div role="status" className="mt-4 rounded-lg border border-success/30 bg-success/[0.06] px-4 py-3 text-sm font-semibold text-success">{success}</div> : null}

            <Panel className="mt-[18px]">
              <h2 className="text-xs font-bold tracking-[0.05em] text-text-muted">COMPOSE BROADCAST</h2>
              <div className="mt-4 space-y-4">
                <Fieldset legend="Template">
                  {templates.map((template) => <Choice key={template.id} label={template.name} selected={templateId === template.id} onClick={() => applyTemplate(template)} />)}
                  <Choice label="Custom message" selected={templateId === null} onClick={useCustomMessage} />
                </Fieldset>

                <div>
                  <label htmlFor="broadcast-subject" className="text-[13px] font-bold text-text">Subject</label>
                  <input id="broadcast-subject" value={subject} onChange={(event) => { setSubject(event.target.value); setSuccess(null); }} placeholder="Broadcast subject" className="mt-2 min-h-11 w-full rounded-[10px] border border-border bg-surface px-3 text-sm text-text outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" />
                </div>

                {selectedTemplate ? <div><h3 className="text-[13px] font-bold text-text">Message preview</h3><p className="mt-2 rounded-[10px] bg-surface-muted p-3 text-[13px] leading-5 text-text-muted">{selectedTemplate.bodyEn}</p></div> : null}

                <Fieldset legend="Audience">
                  {segments.map((segment) => <Choice key={segment.id} label={`${audienceLabel(segment.id)} · ${segment.recipientCount.toLocaleString('en-GB')}`} selected={audienceId === segment.id} onClick={() => { setAudienceId(segment.id); setSuccess(null); }} />)}
                </Fieldset>

                <Fieldset legend="Channel">
                  {channels.map((item) => <Choice key={item} label={channelLabels[item]} selected={channel === item} onClick={() => { setChannel(item); setSuccess(null); }} icon={<ChannelIcon channel={item} />} />)}
                </Fieldset>

                <div className="flex items-center gap-2 text-[13px] font-semibold text-text">
                  <Users aria-hidden size={16} className="text-primary" />
                  This broadcast will reach {recipientCount.toLocaleString('en-GB')} participants.
                </div>
                <button type="button" onClick={() => void sendBroadcast()} disabled={!subject.trim() || communications.isSending} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-extrabold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50">
                  <Send aria-hidden size={15} />
                  {communications.isSending ? 'Sending…' : 'Send broadcast'}
                </button>
              </div>
            </Panel>

            <section aria-labelledby="delivery-log-title" className="mt-5">
              <h2 id="delivery-log-title" className="mb-2.5 text-xs font-bold tracking-[0.05em] text-text-muted">DELIVERY LOG</h2>
              <ol className="space-y-2.5">
                {communications.overview.history.items.map((record) => <DeliveryLogRow key={record.id} record={record} />)}
              </ol>
            </section>

            <p className="mt-5 text-[11px] text-text-muted">Illustrative communications data. No real emails or notifications are sent in this POC.</p>
          </>
        )}
      </div>
    </AdminPortalShell>
  );
}

function Fieldset({ legend, children }: { readonly legend: string; readonly children: React.ReactNode }) {
  return <fieldset><legend className="text-[13px] font-bold text-text">{legend}</legend><div className="mt-2 flex flex-wrap gap-2">{children}</div></fieldset>;
}

function Choice({ label, selected, onClick, icon }: { readonly label: string; readonly selected: boolean; readonly onClick: () => void; readonly icon?: React.ReactNode }) {
  return <button type="button" aria-pressed={selected} onClick={onClick} className={`inline-flex min-h-11 items-center gap-1.5 rounded-full border px-3 text-[13px] transition ${selected ? 'border-primary bg-primary/[0.10] font-bold text-primary-dark' : 'border-border bg-surface font-medium text-text hover:bg-surface-muted'}`}>{icon}{label}</button>;
}

function ChannelIcon({ channel }: { readonly channel: CommsChannel }) {
  if (channel === 'email') return <Mail aria-hidden size={13} />;
  if (channel === 'in-app') return <Smartphone aria-hidden size={13} />;
  return <MessageSquare aria-hidden size={13} />;
}

function DeliveryLogRow({ record }: { readonly record: CommunicationRecord }) {
  return <li className="flex items-center gap-3 rounded-xl border border-border bg-surface p-4 shadow-panel"><div className="min-w-0 flex-1"><p className="truncate text-sm font-bold text-text">{record.subject}</p><p className="mt-1 flex items-center gap-1.5 text-xs text-text-muted"><ChannelIcon channel={record.channel} />{audienceLabel(record.audienceId)} · {record.recipientCount.toLocaleString('en-GB')} recipients · {new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(record.sentAt))}</p></div><span className="rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-extrabold text-success">Sent</span></li>;
}

function ErrorState({ message, onRetry }: { readonly message: string; readonly onRetry: () => void }) {
  return <div role="alert" className="rounded-xl border border-danger/30 bg-surface p-6 text-center shadow-panel"><AlertTriangle aria-hidden size={22} className="mx-auto text-danger" /><p className="mt-2 text-sm text-text">{message}</p><button type="button" onClick={onRetry} className="mt-3 min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white">Try again</button></div>;
}
