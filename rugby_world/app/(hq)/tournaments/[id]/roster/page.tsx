"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/page-header";
import { InlinePlayerForm, InlineTeamForm } from "@/components/tournaments/inline-forms";
import { JourneyNext, useSetupJourney } from "@/components/tournaments/setup-journey";
import { PlayerName } from "@/components/players/player-stats";
import { cn } from "@/lib/utils";
import type { Team } from "@/lib/types";

function TeamBlock({
  team,
  open,
  onToggle,
}: {
  team: Team;
  open: boolean;
  onToggle: () => void;
}) {
  const { state } = useStore();
  const players = state.players.filter((p) => p.teamId === team.id).sort((a, b) => a.number - b.number);
  const welfare = players.filter((p) => p.status === "hia" || p.status === "injured").length;

  return (
    <div className="border-b last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-muted/50"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", open && "rotate-180")} />
        <span className="min-w-0 flex-1">
          <span className="font-medium text-navy">
            {team.flag} {team.name}
          </span>
          <span className="mt-0.5 block text-xs text-muted-foreground">
            {team.pool ? `${team.pool} · ` : ""}
            {team.coach} · {players.length} players
            {welfare > 0 ? ` · ${welfare} welfare flags` : ""}
          </span>
        </span>
      </button>
      {open && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {players.length === 0 ? (
            <p className="text-sm text-muted-foreground">No players named yet.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2">No.</th>
                  <th className="pb-2">Player</th>
                  <th className="pb-2">Position</th>
                  <th className="pb-2">Club</th>
                  <th className="pb-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-t border-border/70">
                    <td className="py-1.5 tabular-nums">{p.number}</td>
                    <td>
                      <PlayerName id={p.id}>{p.name}</PlayerName>
                    </td>
                    <td>{p.position}</td>
                    <td className="text-muted-foreground">{p.club}</td>
                    <td>
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <InlinePlayerForm teamId={team.id} />
        </div>
      )}
    </div>
  );
}

export default function TournamentRosterPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const competition = state.competitions.find((c) => c.id === id);
  const squads = useMemo(() => {
    const teams = state.teams.filter((t) => t.competitionIds.includes(id));
    return [...teams].sort((a, b) => a.name.localeCompare(b.name));
  }, [state.teams, id]);
  const groups = competition?.pools ?? [];
  const assigned = new Set(groups.flatMap((g) => g.standings.map((row) => row.team)));
  const unassigned = squads.filter((t) => !assigned.has(t.name));
  const { steps } = useSetupJourney(id);
  const [showAddTeam, setShowAddTeam] = useState(squads.length === 0);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-navy">Roster</h2>
          <p className="text-sm text-muted-foreground">
            Participating unions and named squads. Add teams first, then create groups.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {squads.length >= 2 && (
            <Link
              href={`/tournaments/${id}/groups`}
              className="wr-btn inline-flex h-7 items-center rounded-lg px-2.5 text-[0.8rem] font-medium"
            >
              Next: create groups
            </Link>
          )}
          <Button type="button" size="sm" variant="brand" onClick={() => setShowAddTeam((v) => !v)}>
            {showAddTeam ? "Hide add team" : "Add team"}
          </Button>
        </div>
      </div>
      {showAddTeam && (
        <div className="mb-6">
          <InlineTeamForm competitionId={id} />
        </div>
      )}
      {squads.length === 0 ? (
        <p className="text-sm text-muted-foreground">No teams on this event yet. Add an existing union side or create one.</p>
      ) : groups.length > 0 ? (
        <div className="space-y-6">
          {groups.map((group) => {
            const teams = group.standings
              .map((row) => squads.find((t) => t.name === row.team))
              .filter((t): t is Team => Boolean(t));
            return (
              <section key={group.name}>
                <h3 className="mb-2 font-heading text-lg font-semibold text-navy">{group.name}</h3>
                <div className="overflow-hidden rounded-lg border">
                  {teams.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-muted-foreground">No teams in this group yet.</p>
                  ) : (
                    teams.map((team) => (
                      <TeamBlock
                        key={team.id}
                        team={team}
                        open={openId === team.id}
                        onToggle={() => setOpenId(openId === team.id ? null : team.id)}
                      />
                    ))
                  )}
                </div>
              </section>
            );
          })}
          {unassigned.length > 0 && (
            <section>
              <h3 className="mb-2 font-heading text-lg font-semibold text-navy">Unassigned</h3>
              <div className="overflow-hidden rounded-lg border">
                {unassigned.map((team) => (
                  <TeamBlock
                    key={team.id}
                    team={team}
                    open={openId === team.id}
                    onToggle={() => setOpenId(openId === team.id ? null : team.id)}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border">
          {squads.map((team) => (
            <TeamBlock
              key={team.id}
              team={team}
              open={openId === team.id}
              onToggle={() => setOpenId(openId === team.id ? null : team.id)}
            />
          ))}
        </div>
      )}
      <JourneyNext steps={steps} on="teams" />
    </div>
  );
}
