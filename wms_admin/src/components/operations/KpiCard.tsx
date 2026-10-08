import type { ReactNode } from 'react';

interface KpiCardProps {
  readonly accent: string;
  readonly label: string;
  readonly value: string;
  readonly detail: ReactNode;
  readonly progress?: number;
  readonly alert?: boolean;
}

export function KpiCard({ accent, label, value, detail, progress, alert = false }: KpiCardProps) {
  return (
    <article
      aria-label={label}
      aria-live={alert ? 'polite' : undefined}
      role={alert ? 'alert' : undefined}
      className={`min-w-[190px] flex-1 rounded-xl border border-l-4 p-4 shadow-panel ${alert ? 'border-danger/35 bg-danger/[0.04]' : 'border-border bg-surface'}`}
      style={{ borderLeftColor: accent }}
    >
      <h2 className="text-[11px] font-bold tracking-[0.055em] text-text-muted">{label}</h2>
      <p className="mt-2 text-[26px] font-extrabold leading-none tracking-[-0.02em] text-text">{value}</p>
      {progress != null ? (
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-muted" aria-hidden>
          <div className="h-full rounded-full" style={{ width: `${Math.round(progress * 100)}%`, backgroundColor: accent }} />
        </div>
      ) : null}
      <div className="mt-2 text-xs text-text-muted">{detail}</div>
    </article>
  );
}
