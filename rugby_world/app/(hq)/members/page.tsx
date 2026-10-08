"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { FederationHierarchy } from "@/components/members/federation-hierarchy";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";

const REGIONS = ["All", "Africa", "Asia", "Europe", "North America", "Oceania", "South America"];

export default function MembersPage() {
  const { state, decideApplication } = useStore();
  const [region, setRegion] = useState("All");
  const [q, setQ] = useState("");
  const [membership, setMembership] = useState("All");
  const [view, setView] = useState<"hierarchy" | "directory">("hierarchy");

  const unions = useMemo(() => {
    return state.unions.filter((u) => {
      if (region !== "All" && u.region !== region) return false;
      if (membership !== "All" && u.membership !== membership) return false;
      if (q && !`${u.name} ${u.country} ${u.abbreviation}`.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [state.unions, region, membership, q]);

  const pending = state.applications.filter((a) => a.status === "pending");

  return (
    <div>
      <PageHeader
        eyebrow="Module 04"
        title="Member Associations"
        description="World Rugby, then each member association, then the clubs registered under that union."
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => setView("hierarchy")}
          className={`rounded-full border px-3 py-1.5 text-sm ${view === "hierarchy" ? "border-navy bg-navy text-white" : "bg-card hover:bg-muted/60"}`}
        >
          Hierarchy
        </button>
        <button
          type="button"
          onClick={() => setView("directory")}
          className={`rounded-full border px-3 py-1.5 text-sm ${view === "directory" ? "border-navy bg-navy text-white" : "bg-card hover:bg-muted/60"}`}
        >
          Directory
        </button>
      </div>
      {view === "hierarchy" && (
        <div className="mb-6">
          <FederationHierarchy />
        </div>
      )}
      {view === "directory" && (
        <>
      <div className="mb-6 grid gap-3 sm:grid-cols-3 xl:grid-cols-6">
        {REGIONS.slice(1).map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRegion(region === r ? "All" : r)}
            className={`rounded-xl border px-3 py-3 text-left ${region === r ? "border-navy bg-navy text-white" : "bg-card"}`}
          >
            <p className="text-xs opacity-80">{r}</p>
            <p className="font-heading text-2xl">{state.unions.filter((u) => u.region === r).length}</p>
          </button>
        ))}
      </div>

      {pending.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Affiliation review queue</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {state.applications.map((app) => (
              <div key={app.id} className="rounded-lg border px-3 py-3">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-medium text-navy">
                      {app.flag} {app.organisation}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {app.region} · submitted {formatDate(app.submittedAt)}
                    </p>
                    <p className="mt-1 text-sm">{app.summary}</p>
                  </div>
                  <StatusBadge status={app.status} />
                </div>
                {app.status === "pending" && (
                  <div className="mt-3 flex gap-2">
                    <Button
                      size="sm"
                      onClick={() => {
                        decideApplication(app.id, "approved");
                        toast.success(`${app.organisation} approved as associate pathway.`);
                      }}
                    >
                      Approve
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        decideApplication(app.id, "rejected");
                        toast.message("Application rejected.");
                      }}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search unions" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-8 rounded-lg border border-input bg-background px-2 text-sm"
          value={membership}
          onChange={(e) => setMembership(e.target.value)}
        >
          <option>All</option>
          <option>Full Member</option>
          <option>Associate Member</option>
        </select>
      </div>

      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Union</th>
              <th className="px-4 py-3">Region</th>
              <th className="px-4 py-3">Membership</th>
              <th className="px-4 py-3">Concussion</th>
              <th className="px-4 py-3">Education</th>
              <th className="px-4 py-3">TMS licence</th>
            </tr>
          </thead>
          <tbody>
            {unions.map((u) => {
              const license = state.licenses.find((row) => row.unionId === u.id);
              return (
              <tr key={u.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/members/${u.id}`} className="font-medium text-navy hover:underline">
                    {u.flag} {u.name}
                  </Link>
                </td>
                <td className="px-4 py-3">{u.region}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={u.membership} />
                </td>
                <td className="px-4 py-3 tabular-nums">{u.concussionCompliance}%</td>
                <td className="px-4 py-3 tabular-nums">{u.educationCompletion}%</td>
                <td className="px-4 py-3">
                  {license ? (
                    <Link href={`/licenses/${license.id}`} className="font-mono text-xs text-navy hover:underline">
                      {license.licenseKey}
                    </Link>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
              </tr>
              );
            })}
          </tbody>
        </table>
      </div>
        </>
      )}
    </div>
  );
}
