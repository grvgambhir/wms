"use client";

import Link from "next/link";
import type { Match } from "@/lib/types";
import { cellMatch, scoreFromRow, type RoundRobinGridGroup } from "@/lib/round-robin";
import { matchWinner } from "@/lib/match-card";
import { cn } from "@/lib/utils";

function resultTone(match: Match, rowTeam: string) {
  if (match.status === "live") return "live";
  const score = scoreFromRow(match, rowTeam);
  if (score.for == null || score.against == null) return "pending";
  if (score.for > score.against) return "win";
  if (score.for < score.against) return "loss";
  return "draw";
}

function Cell({ match, rowTeam }: { match?: Match; rowTeam: string }) {
  if (!match) {
    return <span className="text-muted-foreground/40">·</span>;
  }
  const score = scoreFromRow(match, rowTeam);
  const tone = resultTone(match, rowTeam);
  const winner = matchWinner(match);
  const label =
    score.for != null && score.against != null
      ? `${score.for}-${score.against}`
      : match.status === "live"
        ? "Live"
        : "v";
  const inner = (
    <span
      className={cn(
        "flex h-12 w-full min-w-[4.5rem] flex-col items-center justify-center rounded-md px-1 text-xs tabular-nums",
        tone === "win" && "bg-emerald-100 font-semibold text-emerald-950",
        tone === "loss" && "bg-slate-100 text-slate-500",
        tone === "draw" && "bg-amber-100 font-medium text-amber-950",
        tone === "live" && "bg-emerald-50 font-semibold text-emerald-800 ring-1 ring-emerald-300",
        tone === "pending" && "text-muted-foreground"
      )}
    >
      {label}
      {tone === "win" || tone === "loss" || tone === "draw" ? (
        <span className="text-[10px] font-medium tracking-wide uppercase">
          {tone === "win" ? "Win" : tone === "loss" ? "Loss" : "Draw"}
        </span>
      ) : winner === "draw" ? null : match.status === "live" ? (
        <span className="text-[10px] font-medium tracking-wide uppercase">Live</span>
      ) : (
        <span className="text-[10px] font-medium tracking-wide uppercase">To play</span>
      )}
    </span>
  );
  return (
    <Link href={`/tournaments/matches/${match.id}`} className="block hover:opacity-90" title={match.round}>
      {inner}
    </Link>
  );
}

function Legend() {
  const chip = (className: string, label: string) => (
    <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
      <span className={cn("size-2.5 rounded-sm", className)} />
      {label}
    </span>
  );
  return (
    <div className="flex flex-wrap gap-3">
      {chip("bg-emerald-100 ring-1 ring-emerald-200", "Win")}
      {chip("bg-amber-100 ring-1 ring-amber-200", "Draw")}
      {chip("bg-slate-100 ring-1 ring-slate-200", "Loss")}
      {chip("bg-white ring-1 ring-border", "To play")}
    </div>
  );
}

export function RoundRobinGrid({ groups }: { groups: RoundRobinGridGroup[] }) {
  if (groups.length === 0) return null;

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h3 className="font-heading text-lg font-semibold text-navy">Round robin</h3>
          <p className="text-sm text-muted-foreground">
            All play all. Each cell is the row team against the column team, with the row team score first.
          </p>
        </div>
        <Legend />
      </div>
      {groups.map((group) => (
        <div key={group.name}>
          {groups.length > 1 && (
            <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-navy/60 uppercase">{group.name}</p>
          )}
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="sticky left-0 z-10 min-w-[9rem] bg-muted/80 px-3 py-2 text-left text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
                    Team
                  </th>
                  {group.teams.map((team) => (
                    <th
                      key={team.name}
                      className="min-w-[4.75rem] bg-muted/80 px-1 py-2 text-center text-[11px] font-semibold text-navy"
                      title={team.name}
                    >
                      <span className="block text-base leading-none">{team.flag}</span>
                      <span className="mt-1 block max-w-[4.5rem] truncate font-medium">{team.name}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {group.teams.map((row) => (
                  <tr key={row.name} className="border-t">
                    <th className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-1.5 text-left font-medium text-navy">
                      {row.flag} {row.name}
                    </th>
                    {group.teams.map((col) => (
                      <td key={col.name} className="p-1 text-center">
                        {row.name === col.name ? (
                          <span className="mx-auto block h-12 min-w-[4.5rem] rounded-md bg-muted/70" />
                        ) : (
                          <Cell match={cellMatch(group.matches, row.name, col.name)} rowTeam={row.name} />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </section>
  );
}
