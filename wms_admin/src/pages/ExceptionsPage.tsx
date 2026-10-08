import { useState } from 'react';
import { AlertTriangle, CheckCircle2, Lock, UserCheck, XCircle } from 'lucide-react';

import { AdminPortalShell } from '../components/layout/AdminPortalShell';
import type {
  EligibilityException,
  ExceptionRejectReason,
  ExceptionReviewerId,
} from '../domain/exceptions';
import { useExceptions } from '../hooks/useExceptions';

const REVIEWER_A: ExceptionReviewerId = 'Reviewer A · Sport Admin';
const REVIEWER_B: ExceptionReviewerId = 'Reviewer B · Sport Lead';
const REJECT_REASONS: readonly ExceptionRejectReason[] = [
  'Insufficient evidence',
  'Does not meet criteria',
  'Duplicate request',
];

export function ExceptionsPage() {
  const exceptions = useExceptions();
  const [selectedId, setSelectedId] = useState('EXC-1');
  const selected =
    exceptions.overview?.cases.find((item) => item.id === selectedId) ?? exceptions.overview?.cases[0];

  return (
    <AdminPortalShell>
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-[18px]">
          <div className="flex items-center gap-2.5">
            <AlertTriangle aria-hidden size={22} className="text-primary" />
            <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">Exception Review Queue</h1>
          </div>
          <p className="mt-1 text-sm text-text-muted">
            Review eligibility exceptions with reason codes and dual approval for high-impact cases.
          </p>
        </div>

        {exceptions.isLoading ? (
          <LoadingState />
        ) : !exceptions.overview || !selected ? (
          <ErrorState message={exceptions.error} onRetry={() => void exceptions.reload()} />
        ) : (
          <>
            {exceptions.error ? <ErrorBanner message={exceptions.error} /> : null}
            <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-5">
              <Queue
                cases={exceptions.overview.cases}
                selectedId={selected.id}
                onSelect={setSelectedId}
              />
              <CaseDetail
                exception={selected}
                disabled={exceptions.isMutating}
                onApprove={(reviewerId) => void exceptions.approveException({ exceptionId: selected.id, reviewerId })}
                onReject={(reasonCode) => void exceptions.rejectException({ exceptionId: selected.id, reasonCode })}
              />
            </div>
          </>
        )}
      </div>
    </AdminPortalShell>
  );
}

function Queue({
  cases,
  selectedId,
  onSelect,
}: {
  readonly cases: readonly EligibilityException[];
  readonly selectedId: string;
  readonly onSelect: (id: string) => void;
}) {
  return (
    <section className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-panel">
      <h2 className="border-b border-border p-3.5 font-extrabold text-text">Queue · {cases.length} open</h2>
      <div className="divide-y divide-border">
        {cases.map((exception) => {
          const active = exception.id === selectedId;
          return (
            <button
              key={exception.id}
              type="button"
              aria-pressed={active}
              onClick={() => onSelect(exception.id)}
              className={`min-h-11 w-full p-3.5 text-left transition ${active ? 'bg-primary/[0.08]' : 'hover:bg-surface-muted'}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 font-bold text-text">{exception.participant}</span>
                <StatusPill exception={exception} />
              </div>
              <p className="mt-1 text-xs text-text-muted">{exception.sport} · {exception.event}</p>
              {exception.impact === 'high' ? (
                <p className="mt-1 text-[11px] font-bold text-amber-700">High-impact · dual approval</p>
              ) : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function CaseDetail({
  exception,
  disabled,
  onApprove,
  onReject,
}: {
  readonly exception: EligibilityException;
  readonly disabled: boolean;
  readonly onApprove: (reviewerId: ExceptionReviewerId) => void;
  readonly onReject: (reason: ExceptionRejectReason) => void;
}) {
  const requiredSignatures = exception.impact === 'high' ? 2 : 1;
  const reviewers: readonly ExceptionReviewerId[] = exception.impact === 'high'
    ? [REVIEWER_A, REVIEWER_B]
    : [REVIEWER_A];

  return (
    <section aria-label={`${exception.id} review`} className="rounded-[14px] border border-border bg-surface p-[18px] shadow-panel">
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-extrabold text-text">{exception.participant}</h2>
          <p className="mt-0.5 text-sm text-text-muted">{exception.id} · {exception.sport} · {exception.event}</p>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-[11px] font-extrabold ${exception.impact === 'high' ? 'bg-warning/10 text-amber-700' : 'bg-surface-muted text-text-muted'}`}>
          {exception.impact === 'high' ? 'High-impact' : 'Standard'}
        </span>
      </div>

      {exception.restricted ? (
        <div role="alert" className="mt-3.5 flex items-center gap-2 rounded-lg bg-surface-muted p-2.5 text-xs text-text-muted">
          <Lock aria-hidden size={14} />
          Restricted medical/classification data — access is logged, least-privilege (EVD-03 / PRV-04).
        </div>
      ) : null}

      {exception.checks ? (
        <div className="mt-3.5">
          <h3 className="text-[13px] font-bold text-text">Multi-dimensional eligibility check</h3>
          <div className="mt-2 space-y-2">
            {exception.checks.map((check) => (
              <div key={check.label} className="grid grid-cols-[18px_150px_1fr] items-center gap-2.5 text-[13px]">
                {check.ok ? <CheckCircle2 aria-hidden size={16} className="text-success" /> : <XCircle aria-hidden size={16} className="text-danger" />}
                <span className="font-semibold text-text">{check.label}</span>
                <span className={check.ok ? 'text-text-muted' : 'text-danger'}>{check.detail}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div role="note" className="mt-3.5 rounded-[10px] border border-warning/30 bg-warning/[0.08] p-3 text-[13px] text-amber-800">
        <strong>Requested exception: </strong>{exception.reason}
      </div>

      {exception.decision === 'pending' ? (
        <div className="mt-3.5 space-y-3">
          {exception.impact === 'high' ? (
            <p className="text-[13px] font-bold text-text">
              Dual approval required — {exception.approvers.length}/{requiredSignatures} signatures
            </p>
          ) : null}
          {exception.approvers.map((reviewer) => (
            <p key={reviewer} className="flex items-center gap-1.5 text-xs text-text-muted">
              <UserCheck aria-hidden size={14} className="text-success" />
              {reviewer} approved
            </p>
          ))}
          <div className="flex flex-wrap gap-2.5">
            {reviewers.map((reviewer) => {
              const approved = exception.approvers.includes(reviewer);
              const shortName = reviewer.startsWith('Reviewer A') ? 'Reviewer A' : 'Reviewer B';
              return (
                <button
                  key={reviewer}
                  type="button"
                  disabled={disabled || approved}
                  onClick={() => onApprove(reviewer)}
                  className={`min-h-11 rounded-lg px-4 text-[13px] font-bold transition disabled:cursor-not-allowed ${approved ? 'bg-surface-muted text-text-muted' : 'bg-primary text-white hover:bg-primary-dark disabled:opacity-60'}`}
                >
                  {approved ? `✓ ${shortName}` : `Approve as ${shortName}`}
                </button>
              );
            })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-text-muted">Reject with reason:</span>
            {REJECT_REASONS.map((reason) => (
              <button
                key={reason}
                type="button"
                disabled={disabled}
                onClick={() => onReject(reason)}
                aria-label={`Reject with reason: ${reason}`}
                className="min-h-11 rounded-full border border-danger/40 px-3 text-xs font-semibold text-danger transition hover:bg-danger/[0.05] disabled:cursor-wait disabled:opacity-60"
              >
                {reason}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {exception.decision === 'approved' ? (
        <div role="status" className="mt-3.5 rounded-[10px] border border-success/40 bg-success/[0.06] p-3.5">
          <p className="flex items-center gap-2 font-extrabold text-text">
            <CheckCircle2 aria-hidden size={18} className="text-success" />
            Exception approved — {exception.approvers.length}/{requiredSignatures} signatures
          </p>
          <p className="mt-1.5 text-[13px] text-text-muted">
            {exception.approvers.join(' + ')}. Reason, approvers and timestamp recorded in the audit log (RUL-06); original category preserved (RUL-04).
          </p>
        </div>
      ) : null}

      {exception.decision === 'rejected' ? (
        <div role="status" className="mt-3.5 rounded-[10px] border border-danger/40 bg-danger/[0.06] p-3.5">
          <p className="flex items-center gap-2 font-extrabold text-text">
            <XCircle aria-hidden size={18} className="text-danger" />
            Rejected — {exception.reasonCode}
          </p>
          <p className="mt-1.5 text-[13px] text-text-muted">Participant notified to resubmit; decision basis retained.</p>
        </div>
      ) : null}
    </section>
  );
}

function StatusPill({ exception }: { readonly exception: EligibilityException }) {
  const status = exception.decision === 'approved'
    ? 'Approved'
    : exception.decision === 'rejected'
      ? 'Rejected'
      : exception.approvers.length > 0
        ? `${exception.approvers.length} of 2`
        : 'Pending';
  const classes = exception.decision === 'approved'
    ? 'bg-success/10 text-success'
    : exception.decision === 'rejected'
      ? 'bg-danger/10 text-danger'
      : exception.approvers.length > 0
        ? 'bg-warning/10 text-amber-700'
        : 'bg-surface-muted text-text-muted';
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-extrabold ${classes}`}>{status}</span>;
}

function LoadingState() {
  return <div role="status" className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel">Loading exceptions…</div>;
}

function ErrorState({ message, onRetry }: { readonly message: string | null; readonly onRetry: () => void }) {
  return (
    <div role="alert" className="grid min-h-64 place-items-center rounded-xl border border-danger/30 bg-surface p-8 text-center shadow-panel">
      <div>
        <p className="font-bold text-text">Could not load exceptions.</p>
        {message ? <p className="mt-1 text-sm text-text-muted">{message}</p> : null}
        <button type="button" onClick={onRetry} className="mt-4 min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white">Try again</button>
      </div>
    </div>
  );
}

function ErrorBanner({ message }: { readonly message: string }) {
  return <div role="alert" className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900">{message}</div>;
}
