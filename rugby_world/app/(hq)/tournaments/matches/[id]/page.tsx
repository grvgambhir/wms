"use client";

import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDateTime } from "@/lib/format";
import { MatchDesk, MatchFacts } from "@/components/tournaments/match-desk";
import { PlayerName } from "@/components/players/player-stats";

export default function MatchPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const match = state.matches.find((m) => m.id === id);
  const competition = state.competitions.find((c) => c.id === match?.competitionId);

  if (!match) return <p>Match not found.</p>;

  return (
    <div>
      <PageHeader
        eyebrow={competition?.shortName ?? "Match"}
        title={`${match.homeTeam} v ${match.awayTeam}`}
        description={`${match.round} · ${formatDateTime(match.kickoff)}`}
        actions={<StatusBadge status={match.status} />}
        back={{
          href: competition ? `/tournaments/${competition.id}/fixtures` : "/tournaments",
          label: competition ? `Back to ${competition.shortName} fixtures` : "Back to tournaments",
        }}
      />
      <MatchDesk match={match} />
      <div className="mt-6">
        <MatchFacts match={match} />
        {match.feedsRankings && (
          <p className="mt-4 rounded-md bg-gold/15 px-3 py-2 text-xs text-navy">
            This match feeds World Rugby Rankings. Full time will recalculate the table.
          </p>
        )}
      </div>
      {(match.homeTeamId || match.awayTeamId) && (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {[
            { id: match.homeTeamId, name: match.homeTeam, flag: match.homeFlag },
            { id: match.awayTeamId, name: match.awayTeam, flag: match.awayFlag },
          ].map((side) => {
            if (!side.id) return null;
            const squad = state.players.filter((p) => p.teamId === side.id).sort((a, b) => a.number - b.number);
            return (
              <Card key={side.id}>
                <CardHeader>
                  <CardTitle>
                    {side.flag} {side.name} - match-day squad
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="grid gap-1 text-sm sm:grid-cols-2">
                    {squad.map((p) => (
                      <li key={p.id}>
                        <PlayerName id={p.id} className="hover:underline">
                          <span className="inline-block w-6 tabular-nums text-muted-foreground">{p.number}</span>
                          {p.name}
                        </PlayerName>
                        <span className="ml-1 text-xs text-muted-foreground">{p.position.split(" ")[0]}</span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
