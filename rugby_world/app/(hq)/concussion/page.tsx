"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { ConcussionMatchLog } from "@/components/concussion/match-log";
import { formatDateTime } from "@/lib/format";

export default function ConcussionPage() {
  const { state } = useStore();
  const open = state.cases.filter((c) => c.diagnosis !== "closed" && c.rtpOverall !== "cleared");
  return (
    <div>
      <PageHeader
        eyebrow="Module 02 · confidential demo data"
        title="Concussion Management"
        description="Log HIA from the fixture, then follow HIA and graduated return to play. All player names are fictional."
      />
      <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        Medical records in this prototype are simulated. Do not enter real athlete health information.
      </div>
      <div className="mb-6 grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Open cases</p>
            <p className="font-heading text-3xl text-navy">{open.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Overdue RTP / HIA</p>
            <p className="font-heading text-3xl text-red-800">
              {state.cases.filter((c) => c.rtpOverall === "overdue" || c.hia.some((h) => h.outcome === "pending" && new Date(h.due) < new Date())).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Cleared / closed</p>
            <p className="font-heading text-3xl text-navy">
              {state.cases.filter((c) => c.rtpOverall === "cleared" || c.diagnosis === "closed").length}
            </p>
          </CardContent>
        </Card>
      </div>
      <div className="mb-8">
        <ConcussionMatchLog />
      </div>
      <h2 className="mb-3 font-heading text-lg font-semibold text-navy">Case list</h2>
      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[760px] text-sm">
          <thead className="bg-muted/70 text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3 font-medium">Player</th>
              <th className="px-4 py-3 font-medium">Union / team</th>
              <th className="px-4 py-3 font-medium">Match</th>
              <th className="px-4 py-3 font-medium">Minute</th>
              <th className="px-4 py-3 font-medium">HIA</th>
              <th className="px-4 py-3 font-medium">Diagnosis</th>
              <th className="px-4 py-3 font-medium">RTP</th>
            </tr>
          </thead>
          <tbody>
            {state.cases.map((c) => (
              <tr key={c.id} className="border-t">
                <td className="px-4 py-3">
                  <Link href={`/concussion/${c.id}`} className="font-medium text-navy hover:underline">
                    {c.player}
                  </Link>
                  <p className="text-xs text-muted-foreground">{c.position}</p>
                </td>
                <td className="px-4 py-3">
                  <p>{c.unionName}</p>
                  {c.teamName && (
                    <p className="text-xs text-muted-foreground">
                      {c.teamFlag} {c.teamName}
                    </p>
                  )}
                </td>
                <td className="px-4 py-3 text-xs">
                  {c.matchId ? (
                    <Link href={`/tournaments/matches/${c.matchId}`} className="text-navy hover:underline">
                      {c.matchLabel}
                    </Link>
                  ) : (
                    c.matchLabel
                  )}
                  <p className="text-muted-foreground">{formatDateTime(c.occurredAt)}</p>
                </td>
                <td className="px-4 py-3 tabular-nums">{c.minute != null ? `${c.minute}'` : "-"}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.currentHia} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.diagnosis} />
                </td>
                <td className="px-4 py-3">
                  <StatusBadge status={c.rtpOverall} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
