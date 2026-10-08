"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { StatusBadge } from "@/components/shared/page-header";
import { MatchScorecard } from "@/components/tournaments/match-scorecard";
import { formatDateTime } from "@/lib/format";
import { winnerLabel } from "@/lib/match-card";

export default function TournamentResultsPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const matches = state.matches
    .filter((m) => m.competitionId === id)
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));
  const played = matches.filter((m) => m.status === "live" || m.status === "final");
  const upcoming = matches.filter((m) => m.status === "scheduled");

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-heading text-xl font-semibold text-navy">Results</h2>
        <p className="text-sm text-muted-foreground">
          Scorecards, scorers and match stats for every fixture that has kicked off.
        </p>
      </div>
      {played.length === 0 ? (
        <p className="text-sm text-muted-foreground">No results yet. Live and completed matches appear here.</p>
      ) : (
        <div className="space-y-10">
          {played.map((match) => (
            <article key={match.id}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                    {match.round} · {formatDateTime(match.kickoff)}
                  </p>
                  <p className="text-sm text-navy">{winnerLabel(match)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={match.status} />
                  <Link href={`/tournaments/matches/${match.id}`} className="text-sm font-medium text-navy hover:underline">
                    Open scoring
                  </Link>
                </div>
              </div>
              <MatchScorecard match={match} compact />
            </article>
          ))}
        </div>
      )}
      {upcoming.length > 0 && (
        <section className="mt-10">
          <h3 className="mb-2 font-heading text-lg font-semibold text-navy">Still to play</h3>
          <div className="overflow-hidden rounded-lg border">
            {upcoming.map((m) => (
              <Link
                key={m.id}
                href={`/tournaments/matches/${m.id}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/60"
              >
                <p className="font-medium text-navy">
                  {m.homeFlag} {m.homeTeam} v {m.awayTeam} {m.awayFlag}
                </p>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">
                    {m.round} · {formatDateTime(m.kickoff)}
                  </p>
                  <p className="text-xs font-medium text-navy">Open scoring</p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
