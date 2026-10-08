import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  QrCode,
  RefreshCcw,
  Search,
  ShieldOff,
  XCircle,
} from 'lucide-react';

import { AdminPortalShell } from '../components/layout/AdminPortalShell';
import { KpiCard } from '../components/operations/KpiCard';
import type { AccessZone, AccreditationRecord } from '../domain/accreditationDesk';
import { newIdempotencyKey } from '../api/idempotencyKey';
import { useAccreditationDesk } from '../hooks/useAccreditationDesk';

const zoneLabels: Record<AccessZone, string> = {
  'field-of-play': 'Field of Play',
  'athlete-lounge': 'Athlete Lounge',
  media: 'Media',
  officials: 'Officials',
  'back-of-house': 'Back of House',
};

export function AccreditationDeskPage() {
  const desk = useAccreditationDesk();
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return desk.overview?.records.items ?? [];
    return (desk.overview?.records.items ?? []).filter((record) =>
      record.participantName.toLowerCase().includes(normalized)
      || (record.badgeNumber ?? '').toLowerCase().includes(normalized));
  }, [desk.overview, query]);

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-4">
          <div className="flex items-center gap-2.5">
            <BadgeCheck aria-hidden size={22} className="text-primary" />
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">Accreditation Desk</h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">Review each participant, then issue, reissue or revoke their Games credential.</p>
        </div>

        {desk.isLoading ? (
          <LoadingState />
        ) : !desk.overview ? (
          <ErrorState message={desk.error} onRetry={() => void desk.reload()} />
        ) : (
          <>
            {desk.error ? <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900">{desk.error}</div> : null}
            <div className="grid grid-cols-3 gap-3.5">
              <KpiCard accent="#F59E0B" label="PENDING REVIEW" value={String(desk.overview.summary.pendingCount)} detail={`${desk.overview.summary.pendingCount} awaiting a credential`} />
              <KpiCard accent="#16A34A" label="ISSUED" value={String(desk.overview.summary.issuedCount)} detail={`${desk.overview.summary.issuedCount} credentials active`} />
              <KpiCard accent="#DC2626" label="REVOKED" value={String(desk.overview.summary.revokedCount)} detail={`${desk.overview.summary.revokedCount} credentials revoked`} />
            </div>

            <label className="mt-[18px] flex min-h-11 items-center gap-2 rounded-[10px] border border-border bg-surface px-3 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
              <Search aria-hidden size={16} className="text-text-muted" />
              <span className="sr-only">Offline lookup — search name or badge</span>
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Offline lookup — search name or badge" className="min-w-0 flex-1 bg-transparent py-3 text-sm text-text outline-none placeholder:text-text-muted" />
            </label>

            <h2 className="mb-2.5 mt-[18px] text-xs font-bold tracking-[0.05em] text-text-muted">PARTICIPANTS</h2>
            <div className="space-y-3">
              {filtered.length === 0 ? <p className="text-[13px] text-text-muted">No participants match your search.</p> : filtered.map((record) => (
                <AccreditationCard
                  key={record.id}
                  record={record}
                  busy={desk.pendingRecordId === record.id}
                  mutationInProgress={desk.pendingRecordId != null}
                  onIssue={() => void desk.issueCredential({ recordId: record.id, idempotencyKey: newIdempotencyKey() })}
                  onReissue={() => void desk.reissueCredential({ recordId: record.id, idempotencyKey: newIdempotencyKey() })}
                  onRevoke={() => void desk.revokeCredential({ recordId: record.id, reason: 'Revoked by OC accreditation', idempotencyKey: newIdempotencyKey() })}
                />
              ))}
            </div>
            <p className="mt-5 text-[11px] text-text-muted">Illustrative accreditation data. Photos, badges and QR are mock; final credentials follow the WMS/OC accreditation policy.</p>
          </>
        )}
      </div>
    </AdminPortalShell>
  );
}

function AccreditationCard({ record, busy, mutationInProgress, onIssue, onReissue, onRevoke }: {
  readonly record: AccreditationRecord;
  readonly busy: boolean;
  readonly mutationInProgress: boolean;
  readonly onIssue: () => void;
  readonly onReissue: () => void;
  readonly onRevoke: () => void;
}) {
  const canIssue = record.photoStatus === 'approved' && record.eligibilityStatus === 'approved';
  return (
    <article aria-label={`${record.participantName} accreditation`} className="rounded-xl border border-border bg-surface p-4 shadow-panel">
      <div className="flex items-center gap-3">
        <span aria-hidden className="grid h-11 w-11 place-items-center rounded-lg bg-surface-muted text-sm font-extrabold text-text">
          {record.participantName.split(' ').map((part) => part[0]).slice(0, 2).join('')}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-bold text-text">{record.participantName}</h3>
          <p className="text-xs text-text-muted">{record.nationalityCountryCode} · {record.sportName} · {record.role}</p>
        </div>
        <CredentialBadge record={record} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <ReviewChip label="Photo" value={record.photoStatus === 'approved' ? 'Approved' : record.photoStatus === 'rejected' ? 'Rejected' : 'Submitted'} ok={record.photoStatus === 'approved'} />
        <ReviewChip label="Eligibility" value={record.eligibilityStatus === 'approved' ? 'Approved' : 'Pending'} ok={record.eligibilityStatus === 'approved'} />
        <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] text-text-muted">Access: {record.accessZones.map((zone) => zoneLabels[zone]).join(', ')}</span>
      </div>

      <div className="mt-3">
        {record.status === 'issued' ? (
          <div className="flex gap-2.5">
            <button type="button" onClick={onReissue} disabled={mutationInProgress} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3.5 text-[13px] font-semibold text-text hover:bg-surface-muted disabled:cursor-wait disabled:opacity-55">
              <RefreshCcw aria-hidden size={14} className={busy ? 'animate-spin' : ''} />Reissue
            </button>
            <button type="button" onClick={onRevoke} disabled={mutationInProgress} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-danger/40 px-3.5 text-[13px] font-semibold text-danger hover:bg-danger/[0.05] disabled:cursor-wait disabled:opacity-55">
              <ShieldOff aria-hidden size={14} />Revoke
            </button>
          </div>
        ) : record.status === 'revoked' ? (
          <p role="status" className="flex items-center gap-1.5 text-xs text-text-muted"><XCircle aria-hidden size={15} className="text-danger" />Revoked: {record.revokedReason}</p>
        ) : canIssue ? (
          <button type="button" onClick={onIssue} disabled={mutationInProgress} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-extrabold text-white hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60">
            <BadgeCheck aria-hidden size={15} />{busy ? 'Issuing…' : 'Issue credential'}
          </button>
        ) : (
          <p role="alert" className="flex items-center gap-1.5 rounded-lg border border-warning/35 bg-warning/[0.08] p-2.5 text-xs text-amber-800">
            <AlertTriangle aria-hidden size={15} />Photo and eligibility must both be approved before issuing.
          </p>
        )}
      </div>
    </article>
  );
}

function CredentialBadge({ record }: { readonly record: AccreditationRecord }) {
  if (record.status === 'issued') return (
    <div className="text-right">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-success/10 px-2.5 py-1 text-[11px] font-extrabold text-success"><QrCode aria-hidden size={13} />Issued</span>
      <p className="mt-1 text-xs font-bold text-text">{record.badgeNumber}</p>
    </div>
  );
  return <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${record.status === 'revoked' ? 'bg-surface-muted text-text-muted' : 'bg-warning/10 text-amber-700'}`}>{record.status === 'revoked' ? 'Revoked' : 'Pending review'}</span>;
}

function ReviewChip({ label, value, ok }: { readonly label: string; readonly value: string; readonly ok: boolean }) {
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] ${ok ? 'bg-success/[0.08] text-success' : 'bg-warning/10 text-amber-700'}`}>{ok ? <CheckCircle2 aria-hidden size={12} /> : <AlertTriangle aria-hidden size={12} />}<span className="text-text-muted">{label}:</span><strong>{value}</strong></span>;
}

function LoadingState() {
  return <div role="status" className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel">Loading accreditations…</div>;
}

function ErrorState({ message, onRetry }: { readonly message: string | null; readonly onRetry: () => void }) {
  return <div role="alert" className="grid min-h-64 place-items-center rounded-xl border border-danger/30 bg-surface p-8 text-center shadow-panel"><div><p className="font-bold text-text">Could not load accreditations.</p>{message ? <p className="mt-1 text-sm text-text-muted">{message}</p> : null}<button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white">Try again</button></div></div>;
}
