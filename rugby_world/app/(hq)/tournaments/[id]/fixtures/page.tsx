"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/page-header";
import { formatDateTime } from "@/lib/format";
import { InlineFixtureForm } from "@/components/tournaments/inline-forms";
import { KnockoutBracket } from "@/components/tournaments/knockout-bracket";
import { RoundRobinGrid } from "@/components/tournaments/round-robin-grid";
import { JourneyNext, useSetupJourney } from "@/components/tournaments/setup-journey";
import { isKnockoutMatch } from "@/lib/bracket";
import { buildRoundRobinGrids } from "@/lib/round-robin";
import { structureNeedsKnockout, structureNeedsRoundRobin } from "@/lib/tournament-hub";
import { toast } from "sonner";

export default function TournamentFixturesPage() {
  const { id } = useParams<{ id: string }>();
  const { state, generateRoundRobinSchedule, generateKnockoutBracket } = useStore();
  const { steps, current } = useSetupJourney(id);
  const competition = state.competitions.find((c) => c.id === id);
  const matches = state.matches.filter((m) => m.competitionId === id);
  const knockouts = matches.filter(isKnockoutMatch);
  const league = matches.filter((m) => !isKnockoutMatch(m) && m.round !== "Scoring desk");
  const grids = buildRoundRobinGrids(competition?.pools, league);
  const [showForm, setShowForm] = useState(matches.length === 0);
  const wantsRoundRobin = structureNeedsRoundRobin(competition?.structure);
  const wantsKnockout = structureNeedsKnockout(competition?.structure);
  const ready = matches
    .filter(
      (m) =>
        m.status !== "final" &&
        Boolean(m.homeTeamId && m.awayTeamId) &&
        !(m.events && m.events.length > 0) &&
        (m.period === "prematch" || m.status === "scheduled" || m.status === "live")
    )
    .sort((a, b) => a.kickoff.localeCompare(b.kickoff));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-navy">Fixtures</h2>
          <p className="text-sm text-muted-foreground">
            Auto-build the round-robin grid, then the knockout bracket. Open a fixture to run the scoring desk.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {wantsRoundRobin && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const created = generateRoundRobinSchedule(id);
                if (!created) {
                  toast.message("Round-robin fixtures already exist, or add teams to a group first.");
                  return;
                }
                toast.success(`${created} round-robin fixtures added.`);
              }}
            >
              Auto schedule (round robin)
            </Button>
          )}
          {wantsKnockout && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => {
                const created = generateKnockoutBracket(id);
                if (!created) {
                  toast.message("A knockout bracket already exists, or this structure is league only.");
                  return;
                }
                toast.success(`${created} knockout fixtures added.`);
              }}
            >
              Build knockout bracket
            </Button>
          )}
          <Button type="button" size="sm" variant="brand" onClick={() => setShowForm((v) => !v)}>
            {showForm ? "Hide form" : "Add fixture"}
          </Button>
        </div>
      </div>
      {showForm && (
        <div className="mb-4">
          <InlineFixtureForm competitionId={id} />
        </div>
      )}
      {ready.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-1 font-heading text-lg font-semibold text-navy">Ready for scoring</h3>
          <p className="mb-3 text-sm text-muted-foreground">
            Open a desk, kick off the clock, then tap tries, conversions and penalties on the squad.
          </p>
          <div className="overflow-hidden rounded-lg border">
            {ready.slice(0, 6).map((m) => (
              <Link
                key={m.id}
                href={`/tournaments/matches/${m.id}`}
                className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/60"
              >
                <div>
                  <p className="font-medium text-navy">
                    {m.homeFlag} {m.homeTeam} v {m.awayTeam} {m.awayFlag}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {m.round} · {formatDateTime(m.kickoff)} · {state.venues.find((v) => v.id === m.venueId)?.name}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={m.status === "live" ? "live" : "scheduled"} />
                  <span className="text-sm font-medium text-navy">Open scoring</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}
      {grids.length > 0 && (
        <div className="mb-8">
          <RoundRobinGrid groups={grids} />
        </div>
      )}
      {knockouts.length > 0 && (
        <section className="mb-8">
          <h3 className="mb-3 font-heading text-lg font-semibold text-navy">Knockouts</h3>
          <KnockoutBracket matches={knockouts} venues={state.venues} />
        </section>
      )}
      {matches.length === 0 && !showForm && (
        <p className="text-sm text-muted-foreground">No fixtures yet. Add a match to build the round.</p>
      )}
      {matches.length > 0 && (
        <section>
          <h3 className="mb-3 font-heading text-lg font-semibold text-navy">Match list</h3>
          <div className="overflow-hidden rounded-lg border">
          {matches.map((m) => (
            <Link
              key={m.id}
              href={`/tournaments/matches/${m.id}`}
              className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3 last:border-b-0 hover:bg-muted/60"
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
                  {m.round} · {formatDateTime(m.kickoff)} · {state.venues.find((v) => v.id === m.venueId)?.name}
                  {m.status === "final" && m.homeScore != null && m.awayScore != null
                    ? m.homeScore === m.awayScore
                      ? " · Draw"
                      : ` · ${m.homeScore > m.awayScore ? m.homeTeam : m.awayTeam} win`
                    : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge status={m.status} />
                <span className="text-sm font-medium text-navy">
                  {m.status === "final" ? "Scorecard" : "Open scoring"}
                </span>
              </div>
            </Link>
          ))}
          </div>
        </section>
      )}
      {current && current.id !== "fixtures" && current.id !== "brackets" ? <JourneyNext steps={steps} /> : null}
    </div>
  );
}
