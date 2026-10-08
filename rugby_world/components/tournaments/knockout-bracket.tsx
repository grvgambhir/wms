"use client";

import Link from "next/link";
import type { Match, Venue } from "@/lib/types";
import { splitKnockoutBracket } from "@/lib/bracket";
import { matchWinner } from "@/lib/match-card";
import { formatDateTime } from "@/lib/format";
import { StatusBadge } from "@/components/shared/page-header";
import { cn } from "@/lib/utils";

function BracketConnectors({ fromCount }: { fromCount: number }) {
  if (fromCount <= 0) return <div className="w-7 shrink-0" />;
  const pairs = Math.ceil(fromCount / 2);
  const paths: string[] = [];
  for (let pair = 0; pair < pairs; pair += 1) {
    const first = pair * 2;
    const second = Math.min(pair * 2 + 1, fromCount - 1);
    const y1 = ((first + 0.5) / fromCount) * 100;
    const y2 = ((second + 0.5) / fromCount) * 100;
    const mid = (y1 + y2) / 2;
    if (first === second) {
      paths.push(`M 0 ${y1} H 28`);
    } else {
      paths.push(`M 0 ${y1} H 14 V ${y2} H 0 M 14 ${mid} H 28`);
    }
  }
  return (
    <div className="w-8 shrink-0 self-stretch text-navy/25">
      <svg className="h-full w-full" viewBox="0 0 28 100" preserveAspectRatio="none" aria-hidden>
        {paths.map((d) => (
          <path key={d} d={d} fill="none" stroke="currentColor" strokeWidth="1.4" />
        ))}
      </svg>
    </div>
  );
}

function TeamRow({
  flag,
  name,
  score,
  winner,
  loser,
}: {
  flag: string;
  name: string;
  score: number | null;
  winner: boolean;
  loser: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-2 px-3 py-1.5",
        winner && "bg-navy/[0.06]",
        loser && "opacity-55"
      )}
    >
      <p className={cn("min-w-0 truncate text-sm text-navy", winner && "font-semibold")}>
        <span className="mr-1.5">{flag}</span>
        {name}
      </p>
      <span className={cn("tabular-nums text-sm", winner ? "font-semibold text-navy" : "text-muted-foreground")}>
        {score == null ? "-" : score}
      </span>
    </div>
  );
}

function BracketMatchCard({ match, venue }: { match: Match; venue?: Venue }) {
  const winner = matchWinner(match);
  const decided = winner != null && winner !== "draw";
  return (
    <Link
      href={`/tournaments/matches/${match.id}`}
      className={cn(
        "block w-[230px] overflow-hidden rounded-lg border bg-white shadow-sm transition hover:border-navy/30 hover:shadow-md",
        match.status === "live" && "border-emerald-400 ring-2 ring-emerald-200"
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/50 px-3 py-1.5">
        <p className="truncate text-[11px] font-semibold tracking-wide text-navy/70 uppercase">{match.round}</p>
        <StatusBadge status={match.status} />
      </div>
      <TeamRow
        flag={match.homeFlag}
        name={match.homeTeam}
        score={match.homeScore}
        winner={decided && winner === "home"}
        loser={decided && winner === "away"}
      />
      <div className="border-t border-border/70" />
      <TeamRow
        flag={match.awayFlag}
        name={match.awayTeam}
        score={match.awayScore}
        winner={decided && winner === "away"}
        loser={decided && winner === "home"}
      />
      <p className="border-t px-3 py-1.5 text-[11px] text-muted-foreground">
        {formatDateTime(match.kickoff)}
        {venue ? ` · ${venue.name}` : ""}
      </p>
    </Link>
  );
}

export function KnockoutBracket({
  matches,
  venues,
  emptyHint,
}: {
  matches: Match[];
  venues: Venue[];
  emptyHint?: string;
}) {
  const { main, playoff } = splitKnockoutBracket(matches);
  if (main.length === 0 && playoff.length === 0) {
    return (
      <p className="rounded-lg border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
        {emptyHint ?? "No knockout fixtures yet. Add quarter-finals, semi-finals or a final to build the bracket."}
      </p>
    );
  }

  const venueById = new Map(venues.map((venue) => [venue.id, venue]));
  const height = Math.max(280, Math.max(...[...main, ...playoff].map((round) => round.matches.length)) * 140);

  return (
    <div className="space-y-6">
      {main.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-slate-50/80 p-4">
          <div className="flex min-w-max" style={{ minHeight: height }}>
            {main.map((round, index) => (
              <div key={round.label} className="flex">
                <div className="flex min-w-[246px] flex-col">
                  <p className="mb-3 text-center text-[11px] font-semibold tracking-[0.16em] text-navy/60 uppercase">
                    {round.label}
                  </p>
                  <div className="flex flex-1 flex-col justify-around gap-4">
                    {round.matches.map((match) => (
                      <div key={match.id} className="flex justify-center">
                        <BracketMatchCard match={match} venue={venueById.get(match.venueId)} />
                      </div>
                    ))}
                  </div>
                </div>
                {index < main.length - 1 && <BracketConnectors fromCount={round.matches.length} />}
              </div>
            ))}
          </div>
        </div>
      )}
      {playoff.map((round) => (
        <div key={round.label}>
          <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-navy/60 uppercase">{round.label}</p>
          <div className="flex flex-wrap gap-4">
            {round.matches.map((match) => (
              <BracketMatchCard key={match.id} match={match} venue={venueById.get(match.venueId)} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
