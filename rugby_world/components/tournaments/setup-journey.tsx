"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";
import {
  buildSetupJourney,
  currentSetupStep,
  type SetupStep,
} from "@/lib/tournament-hub";

export function useSetupJourney(competitionId: string) {
  const { state } = useStore();
  const competition = state.competitions.find((row) => row.id === competitionId);
  const teams = state.teams.filter((row) => row.competitionIds.includes(competitionId));
  const matches = state.matches.filter((row) => row.competitionId === competitionId);
  const license = competition?.licenseId ? state.licenses.find((row) => row.id === competition.licenseId) : undefined;
  const steps = competition
    ? buildSetupJourney({
        competitionId,
        structure: competition.structure,
        teamCount: teams.length,
        pools: competition.pools,
        matches,
        modules: license?.modules,
      })
    : [];
  return { competition, teams, matches, steps, current: currentSetupStep(steps) };
}

export function SetupJourney({ steps }: { steps: SetupStep[] }) {
  const visible = steps.filter((step) => step.status !== "skipped");
  if (visible.length === 0) return null;
  const current = currentSetupStep(steps);
  const complete = visible.every((step) => step.status === "done");

  return (
    <section className="mb-4 rounded-xl border bg-card p-4">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            Competition journey
          </p>
          <h2 className="font-heading text-lg font-semibold text-navy">
            {complete ? "This event is set up" : current ? `Next: ${current.label.toLowerCase()}` : "Set up this tournament"}
          </h2>
          <p className="text-sm text-muted-foreground">
            Add teams, create groups, auto-build round-robin fixtures, then the knockout bracket, then appoint officials for each match.
          </p>
        </div>
        {current ? (
          <Link href={current.href} className="wr-btn inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium">
            {current.cta}
          </Link>
        ) : null}
      </div>
      <ol className="grid gap-2 sm:grid-cols-5">
        {visible.map((step, index) => {
          const done = step.status === "done";
          const active = step.status === "current";
          return (
            <li key={step.id}>
              <Link
                href={step.href}
                className={cn(
                  "flex h-full flex-col rounded-lg border px-3 py-3 transition",
                  done && "border-emerald-200 bg-emerald-50",
                  active && "border-navy bg-navy text-white shadow-sm",
                  step.status === "upcoming" && "bg-muted/40 hover:bg-muted"
                )}
              >
                <span className="flex items-center gap-2 text-[11px] font-semibold tracking-[0.14em] uppercase">
                  <span
                    className={cn(
                      "inline-flex size-5 items-center justify-center rounded-full text-[11px]",
                      done && "bg-emerald-600 text-white",
                      active && "bg-white text-navy",
                      step.status === "upcoming" && "bg-white text-navy"
                    )}
                  >
                    {done ? <Check className="size-3" strokeWidth={3} /> : index + 1}
                  </span>
                  {step.label}
                </span>
                <span className={cn("mt-1.5 text-xs", active ? "text-white/80" : "text-muted-foreground")}>
                  {step.hint}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function JourneyNext({ steps, on }: { steps: SetupStep[]; on?: SetupStep["id"] }) {
  const current = currentSetupStep(steps);
  if (!current) return null;
  if (on && current.id === on) return null;
  return (
    <div className="mt-8 flex justify-end border-t pt-4">
      <Link href={current.href} className="wr-btn inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium">
        Next: {current.cta}
      </Link>
    </div>
  );
}
