import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  back?: { href: string; label: string };
}) {
  return (
    <div className="mb-6">
      {back && (
        <Link
          href={back.href}
          className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline"
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
          {back.label}
        </Link>
      )}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          {eyebrow && (
            <p className="mb-1 text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">
              {eyebrow}
            </p>
          )}
          <h1 className="font-heading text-3xl font-semibold tracking-tight text-navy">
            {title}
          </h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function KpiCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string | number;
  hint?: string;
  href?: string;
}) {
  const inner = (
    <>
      <p className="min-h-8 text-[11px] font-semibold leading-4 tracking-[0.12em] text-muted-foreground uppercase">
        {label}
      </p>
      <p className="mt-2 font-heading text-3xl font-semibold tabular-nums text-navy">{value}</p>
      {hint && <p className="mt-auto pt-1 text-xs text-muted-foreground">{hint}</p>}
    </>
  );
  const className =
    "flex h-full min-w-0 w-full flex-col rounded-xl border border-border bg-card p-4 shadow-sm transition-shadow hover:shadow-md";
  if (href) {
    return (
      <Link href={href} className={className}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

export function StatusBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const map: Record<string, string> = {
    live: "bg-emerald-100 text-emerald-800",
    upcoming: "bg-sky-100 text-sky-800",
    scheduled: "bg-sky-100 text-sky-800",
    completed: "bg-slate-200 text-slate-700",
    final: "bg-slate-200 text-slate-700",
    active: "bg-emerald-100 text-emerald-800",
    suspended: "bg-orange-100 text-orange-900",
    expired: "bg-red-100 text-red-800",
    Expired: "bg-red-100 text-red-800",
    draft: "bg-amber-100 text-amber-900",
    published: "bg-emerald-100 text-emerald-800",
    requested: "bg-amber-100 text-amber-900",
    declined: "bg-slate-200 text-slate-700",
    enrolled: "bg-sky-100 text-sky-800",
    region: "bg-navy/10 text-navy",
    club: "bg-sky-100 text-sky-800",
    passed: "bg-emerald-100 text-emerald-800",
    failed: "bg-red-100 text-red-800",
    pending: "bg-amber-100 text-amber-900",
    approved: "bg-emerald-100 text-emerald-800",
    rejected: "bg-red-100 text-red-800",
    overdue: "bg-red-100 text-red-800",
    confirmed: "bg-red-100 text-red-800",
    suspected: "bg-amber-100 text-amber-900",
    cleared: "bg-emerald-100 text-emerald-800",
    closed: "bg-slate-200 text-slate-700",
    hold: "bg-orange-100 text-orange-900",
    "in-progress": "bg-sky-100 text-sky-800",
    submitted: "bg-sky-100 text-sky-800",
    graded: "bg-emerald-100 text-emerald-800",
    Valid: "bg-emerald-100 text-emerald-800",
    Expiring: "bg-amber-100 text-amber-900",
    expiring: "bg-amber-100 text-amber-900",
    "No expiry": "bg-slate-100 text-slate-700",
    "Awaiting issue": "bg-amber-100 text-amber-900",
    "not-started": "bg-slate-100 text-slate-600",
    "Full Member": "bg-navy/10 text-navy",
    "Associate Member": "bg-gold/20 text-navy",
    complete: "bg-slate-200 text-slate-700",
    planned: "bg-slate-100 text-slate-700",
    assigned: "bg-sky-100 text-sky-800",
    "at-risk": "bg-red-100 text-red-800",
    ready: "bg-emerald-100 text-emerald-800",
    available: "bg-emerald-100 text-emerald-800",
    injured: "bg-orange-100 text-orange-900",
    hia: "bg-red-100 text-red-800",
    diagnose: "bg-red-100 text-red-800",
    remove: "bg-red-100 text-red-800",
    return: "bg-emerald-100 text-emerald-800",
    refer: "bg-amber-100 text-amber-900",
    confirm: "bg-orange-100 text-orange-900",
    clear: "bg-emerald-100 text-emerald-800",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide uppercase",
        map[status] ?? "bg-muted text-muted-foreground",
        className
      )}
    >
      {status.replaceAll("-", " ")}
    </span>
  );
}
