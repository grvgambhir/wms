"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { licenseDaysLeft, licenseWatch, moduleLabel } from "@/lib/licenses";

export default function LicensesPage() {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const watch = useMemo(
    () =>
      state.licenses
        .map((row) => ({ row, days: licenseDaysLeft(row.endsAt), watch: licenseWatch(row) }))
        .filter((item) => item.watch === "expiring" || item.watch === "expired")
        .sort((a, b) => a.days - b.days),
    [state.licenses]
  );
  const expiring = watch.filter((item) => item.watch === "expiring");
  const licenses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.licenses
      .filter((row) => {
        const union = state.unions.find((item) => item.id === row.unionId);
        const blob = `${row.licenseKey} ${union?.name} ${union?.country} ${row.contactEmail ?? ""} ${row.contactName}`;
        return !q || blob.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => licenseDaysLeft(a.endsAt) - licenseDaysLeft(b.endsAt));
  }, [state.licenses, state.unions, query]);
  const active = state.licenses.filter((row) => row.status === "active").length;

  return (
    <div>
      <PageHeader
        eyebrow="Licensing"
        title="TMS licences"
        description="Sub-license Tournament Management to a member association. Watch term dates, contacts and the tournaments they run."
        actions={
          <Link href="/licenses/new" className="wr-btn inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium">
            Issue licence
          </Link>
        }
      />
      {watch.length > 0 && (
        <section className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4">
          <h2 className="font-heading text-lg font-semibold text-navy">Term watch</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {expiring.length} {expiring.length === 1 ? "licence is" : "licences are"} inside the renewal window
            {watch.some((item) => item.watch === "expired") ? ", plus expired terms that need a decision." : "."}
          </p>
          <div className="overflow-auto rounded-lg border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Union</th>
                  <th className="px-3 py-2">Ends</th>
                  <th className="px-3 py-2">Contact</th>
                  <th className="px-3 py-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {watch.map(({ row, days, watch: flag }) => {
                  const union = state.unions.find((item) => item.id === row.unionId);
                  return (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">
                        <Link href={`/licenses/${row.id}`} className="font-medium text-navy hover:underline">
                          {union?.flag} {union?.name}
                        </Link>
                        <p className="font-mono text-[11px] text-muted-foreground">{row.licenseKey}</p>
                      </td>
                      <td className="px-3 py-2">
                        {formatDate(row.endsAt)}
                        <p className="text-[11px] text-muted-foreground">
                          {days < 0 ? `${Math.abs(days)} days overdue` : `${days} days left`}
                        </p>
                      </td>
                      <td className="px-3 py-2">
                        <p>{row.contactName}</p>
                        {row.contactEmail ? (
                          <a href={`mailto:${row.contactEmail}`} className="text-xs text-navy hover:underline">
                            {row.contactEmail}
                          </a>
                        ) : (
                          <p className="text-xs text-muted-foreground">{row.contactPhone || "No email"}</p>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge status={flag} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Input className="max-w-sm" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search union, licence ID or email" />
        <p className="text-sm text-muted-foreground">
          {active} active · {expiring.length} expiring · {state.licenses.filter((row) => row.status === "expired").length} expired
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Union</th>
              <th className="px-4 py-3">Licence ID</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Modules</th>
              <th className="px-4 py-3">Term</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {licenses.map((row) => {
              const union = state.unions.find((item) => item.id === row.unionId);
              const flag = licenseWatch(row);
              const days = licenseDaysLeft(row.endsAt);
              return (
                <tr key={row.id} className="border-t">
                  <td className="px-4 py-3">
                    <Link href={`/licenses/${row.id}`} className="font-medium text-navy hover:underline">
                      {union?.flag} {union?.name}
                    </Link>
                    <p className="text-xs text-muted-foreground">{union?.region}</p>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{row.licenseKey}</td>
                  <td className="px-4 py-3">
                    <p>{row.contactName}</p>
                    <p className="text-xs text-muted-foreground">{row.contactEmail || row.contactPhone || row.contactRole}</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {row.modules.length} · {row.modules.slice(0, 2).map(moduleLabel).join(", ")}
                    {row.modules.length > 2 ? "…" : ""}
                  </td>
                  <td className="px-4 py-3">
                    {formatDate(row.endsAt)}
                    <p className="text-[11px] text-muted-foreground">
                      {days < 0 ? "Ended" : `${days} days left`}
                      {row.autoRenew ? " · auto-renew" : ""}
                    </p>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={flag === "ok" ? row.status : flag} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
