"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { KpiCard, PageHeader, StatusBadge } from "@/components/shared/page-header";
import { formatDateTime } from "@/lib/format";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TournamentCalendar } from "@/components/dashboard/tournament-calendar";
import { LiveScoreTicker } from "@/components/dashboard/live-score-ticker";
import { licenseWatch } from "@/lib/licenses";

export default function DashboardPage() {
  const { state } = useStore();
  const liveUpcoming = state.matches.filter((m) => m.status !== "final").length;
  const openHia = state.cases.filter((c) => c.rtpOverall !== "cleared" && c.diagnosis !== "closed").length;
  const movers = state.rankings["mens-15s"].filter((t) => t.rank !== t.previousRank).length;
  const drafts = state.articles.filter((a) => a.status === "draft").length + state.pages.filter((p) => p.status === "draft").length;
  const completions = state.certificates.filter((c) => c.issuedAt.startsWith("2026-09")).length;

  const fixtures = [...state.matches]
    .filter((m) => m.status !== "final")
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff))
    .slice(0, 4);
  const watchlist = state.cases.filter((c) => c.rtpOverall === "overdue" || c.hia.some((h) => h.outcome === "pending"));
  const top10 = state.rankings["mens-15s"].slice(0, 10);
  const cmsDrafts = state.articles.filter((a) => a.status === "draft");
  const regions = ["Africa", "Asia", "Europe", "North America", "Oceania", "South America"];

  return (
    <div>
      <PageHeader
        eyebrow="Command centre"
        title="World Rugby HQ"
        description="Live picture across tournaments, player welfare, member unions, rankings, content and education."
      />
      <div className="mb-6">
        <LiveScoreTicker />
      </div>
      <div className="grid grid-cols-2 items-stretch gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard label="Fixtures in play" value={liveUpcoming} hint="Scheduled or live" href="/tournaments" />
        <KpiCard label="Open HIA / RTP" value={openHia} hint="Medical follow-up" href="/concussion" />
        <KpiCard label="Ranking movers" value={movers} hint="Men’s 15s this week" href="/rankings" />
        <KpiCard label="CMS drafts" value={drafts} hint="Awaiting publish" href="/cms" />
        <KpiCard
          label="TMS licences"
          value={state.licenses.filter((row) => row.status === "active").length}
          hint={`${state.licenses.filter((row) => licenseWatch(row) === "expiring").length} due within 90 days`}
          href="/licenses"
        />
        <KpiCard label="Certificates (Sep)" value={completions} hint="Issued this month" href="/education" />
      </div>

      <div className="mt-6">
        <TournamentCalendar competitions={state.competitions} />
      </div>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Upcoming fixtures</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {fixtures.map((m) => (
              <Link
                key={m.id}
                href={`/tournaments/matches/${m.id}`}
                className="flex items-center justify-between rounded-lg border border-border px-3 py-2 hover:bg-muted/60"
              >
                <div>
                  <p className="font-medium text-navy">
                    {m.homeFlag} {m.homeTeam}{" "}
                    {m.status !== "scheduled" && m.homeScore != null && m.awayScore != null
                      ? `${m.homeScore}-${m.awayScore}`
                      : "v"}{" "}
                    {m.awayTeam} {m.awayFlag}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.round} · {formatDateTime(m.kickoff)}
                  </p>
                </div>
                <StatusBadge status={m.status} />
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Concussion watchlist</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {watchlist.map((c) => (
              <Link
                key={c.id}
                href={`/concussion/${c.id}`}
                className="block rounded-lg border border-red-100 bg-red-50/60 px-3 py-2 hover:bg-red-50"
              >
                <p className="font-medium text-navy">{c.player}</p>
                <p className="text-xs text-muted-foreground">
                  {c.unionName} · {c.rtpOverall === "overdue" ? "RTP overdue" : "HIA pending"}
                </p>
              </Link>
            ))}
            {watchlist.length === 0 && (
              <p className="text-sm text-muted-foreground">No overdue cases.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Men’s 15s · top 10</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="space-y-1.5">
              {top10.map((t) => {
                const move = t.previousRank - t.rank;
                return (
                  <li key={t.id} className="flex items-center justify-between text-sm">
                    <span>
                      <span className="mr-2 inline-block w-5 tabular-nums text-muted-foreground">{t.rank}</span>
                      {t.flag} {t.team}
                    </span>
                    <span className="tabular-nums">
                      {t.points.toFixed(2)}
                      <span className={move > 0 ? "ml-2 text-emerald-700" : move < 0 ? "ml-2 text-red-700" : "ml-2 text-muted-foreground"}>
                        {move > 0 ? `↑${move}` : move < 0 ? `↓${Math.abs(move)}` : "-"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>
            <Link href="/rankings" className="mt-3 inline-block text-xs font-medium text-navy hover:underline">
              Open rankings
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>CMS drafts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {cmsDrafts.map((a) => (
              <Link key={a.id} href={`/cms/news/${a.id}`} className="block rounded-lg border px-3 py-2 hover:bg-muted/60">
                <p className="font-medium text-navy">{a.title}</p>
                <p className="text-xs text-muted-foreground">{formatDateTime(a.updatedAt)}</p>
              </Link>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Member network</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {regions.map((region) => {
              const count = state.unions.filter((u) => u.region === region).length;
              return (
                <div key={region} className="flex items-center justify-between text-sm">
                  <span>{region}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium">{count} unions</span>
                </div>
              );
            })}
            <Link href="/members" className="mt-2 inline-block text-xs font-medium text-navy hover:underline">
              Open member associations
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
