"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import type { Match } from "@/lib/types";
import { ConcussionEntryForm } from "@/components/concussion/case-form";
import { StatusBadge } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { clockParts } from "@/lib/match-clock";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

function matchOrder(status: Match["status"]) {
  if (status === "live") return 0;
  if (status === "scheduled") return 1;
  return 2;
}

export function ConcussionMatchLog() {
  const { state } = useStore();
  const liveMatches = state.matches.filter((match) => match.status === "live");
  const competitions = [...state.competitions].sort((a, b) => {
    const liveA = state.matches.some((match) => match.competitionId === a.id && match.status === "live");
    const liveB = state.matches.some((match) => match.competitionId === b.id && match.status === "live");
    if (liveA !== liveB) return liveA ? -1 : 1;
    return a.startDate.localeCompare(b.startDate);
  });
  const [competitionId, setCompetitionId] = useState(liveMatches[0]?.competitionId ?? competitions[0]?.id ?? "");
  const [matchId, setMatchId] = useState(liveMatches[0]?.id ?? "");
  const [training, setTraining] = useState(false);
  const [, setTick] = useState(0);

  const selectedMatch = state.matches.find((match) => match.id === matchId);
  useEffect(() => {
    if (!selectedMatch?.clockRunning) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [selectedMatch?.clockRunning, selectedMatch?.id]);

  const eventMatches = useMemo(() => {
    return state.matches
      .filter((match) => match.competitionId === competitionId)
      .sort((a, b) => matchOrder(a.status) - matchOrder(b.status) || a.kickoff.localeCompare(b.kickoff));
  }, [competitionId, state.matches]);

  const rounds = useMemo(() => {
    const map = new Map<string, Match[]>();
    for (const match of eventMatches) {
      const list = map.get(match.round) ?? [];
      list.push(match);
      map.set(match.round, list);
    }
    return [...map.entries()];
  }, [eventMatches]);

  const competition = state.competitions.find((row) => row.id === competitionId);
  const clock = selectedMatch ? clockParts(selectedMatch) : null;
  const matchCases = state.cases.filter((row) => row.matchId === matchId);

  return (
    <section className="space-y-4">
      <div>
        <h2 className="font-heading text-lg font-semibold text-navy">Log HIA from a match</h2>
        <p className="text-sm text-muted-foreground">
          Pick the event, then the fixture, then the player from that match-day squad.
        </p>
      </div>

      {liveMatches.length > 0 && (
        <div>
          <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Live now</p>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {liveMatches.map((match) => {
              const event = state.competitions.find((row) => row.id === match.competitionId);
              return (
                <button
                  key={match.id}
                  type="button"
                  onClick={() => {
                    setTraining(false);
                    setCompetitionId(match.competitionId);
                    setMatchId(match.id);
                  }}
                  className={cn(
                    "min-w-[220px] shrink-0 rounded-xl border px-3 py-2 text-left",
                    matchId === match.id && !training ? "border-navy bg-navy text-white" : "bg-card hover:bg-muted/60"
                  )}
                >
                  <p className="text-[11px] font-semibold tracking-wide uppercase opacity-70">
                    {event?.shortName} · {match.round}
                  </p>
                  <p className="mt-1 text-sm font-medium">
                    {match.homeFlag} {match.homeTeam} {match.homeScore ?? 0}-{match.awayScore ?? 0} {match.awayTeam}{" "}
                    {match.awayFlag}
                  </p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      <div>
        <p className="mb-2 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Tournament</p>
        <div className="flex flex-wrap gap-2">
          {competitions.map((event) => {
            const liveCount = state.matches.filter((match) => match.competitionId === event.id && match.status === "live").length;
            return (
              <button
                key={event.id}
                type="button"
                onClick={() => {
                  setTraining(false);
                  setCompetitionId(event.id);
                  const next =
                    state.matches.find((match) => match.competitionId === event.id && match.status === "live") ??
                    state.matches.find((match) => match.competitionId === event.id && match.status === "scheduled") ??
                    state.matches.find((match) => match.competitionId === event.id);
                  setMatchId(next?.id ?? "");
                }}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  competitionId === event.id && !training ? "border-navy bg-navy text-white" : "bg-card hover:bg-muted/60"
                )}
              >
                {event.shortName}
                {liveCount > 0 ? ` · ${liveCount} live` : ""}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setTraining(true);
              setMatchId("");
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              training ? "border-navy bg-navy text-white" : "bg-card hover:bg-muted/60"
            )}
          >
            Training / off-field
          </button>
        </div>
      </div>

      {training ? (
        <TrainingCaseForm
          onCreated={() => {
            setTraining(false);
          }}
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
          <div className="max-h-[520px] overflow-y-auto rounded-xl border bg-card">
            {eventMatches.length === 0 ? (
              <p className="px-4 py-6 text-sm text-muted-foreground">No fixtures in this event yet.</p>
            ) : (
              rounds.map(([round, matches]) => (
                <div key={round} className="border-b last:border-b-0">
                  <p className="sticky top-0 bg-muted/80 px-4 py-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    {round}
                  </p>
                  {matches.map((match) => {
                    const tagged = state.cases.filter((row) => row.matchId === match.id).length;
                    return (
                      <button
                        key={match.id}
                        type="button"
                        onClick={() => setMatchId(match.id)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 border-t px-4 py-3 text-left hover:bg-muted/50",
                          matchId === match.id && "bg-navy/5"
                        )}
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-navy">
                            {match.homeFlag} {match.homeTeam}{" "}
                            {match.homeScore != null && match.awayScore != null
                              ? `${match.homeScore}-${match.awayScore}`
                              : "v"}{" "}
                            {match.awayTeam} {match.awayFlag}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatDateTime(match.kickoff)}
                            {tagged > 0 ? ` · ${tagged} HIA` : ""}
                          </p>
                        </div>
                        <StatusBadge status={match.status} />
                      </button>
                    );
                  })}
                </div>
              ))
            )}
          </div>

          <div className="rounded-xl border bg-card p-4">
            {selectedMatch ? (
              <div className="space-y-4">
                <div>
                  <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
                    {competition?.shortName} · {selectedMatch.round}
                  </p>
                  <p className="font-heading text-lg font-semibold text-navy">
                    {selectedMatch.homeFlag} {selectedMatch.homeTeam} v {selectedMatch.awayTeam} {selectedMatch.awayFlag}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {formatDateTime(selectedMatch.kickoff)}
                    {selectedMatch.status === "live" && clock ? ` · ${clock.label}` : ""}
                  </p>
                  <Link
                    href={`/tournaments/matches/${selectedMatch.id}`}
                    className="mt-1 inline-block text-xs font-medium text-navy hover:underline"
                  >
                    Open scoring desk
                  </Link>
                </div>
                {matchCases.length > 0 && (
                  <div className="space-y-1 text-sm">
                    {matchCases.map((row) => (
                      <Link
                        key={row.id}
                        href={`/concussion/${row.id}`}
                        className="flex items-center justify-between rounded-md border px-3 py-2 hover:bg-muted/60"
                      >
                        <span>
                          {row.teamFlag} {row.player}
                          {row.minute != null ? ` · ${row.minute}'` : ""}
                        </span>
                        <StatusBadge status={row.currentHia} />
                      </Link>
                    ))}
                  </div>
                )}
                <ConcussionEntryForm
                  key={selectedMatch.id}
                  matchId={selectedMatch.id}
                  defaultMinute={selectedMatch.status === "live" ? clock?.minute : undefined}
                />
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Select a fixture to log a case from that match squad.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

function TrainingCaseForm({ onCreated }: { onCreated?: () => void }) {
  const { state, createConcussionCase } = useStore();
  const [playerName, setPlayerName] = useState("");
  const [position, setPosition] = useState("");
  const [unionId, setUnionId] = useState(state.unions[0]?.id ?? "");
  const [notes, setNotes] = useState("");
  const union = state.unions.find((row) => row.id === unionId);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = playerName.trim();
    if (!name) {
      toast.error("Name the player.");
      return;
    }
    const id = createConcussionCase({
      player: name,
      position: position.trim() || "Unknown",
      unionId: union?.id || "",
      unionName: union?.name || "Unknown union",
      matchId: null,
      matchLabel: "Training / off-field",
      notes,
      source: "manual",
    });
    if (!id) {
      toast.error("Could not open the case.");
      return;
    }
    toast.success(`${name} added to the concussion list.`);
    setPlayerName("");
    setPosition("");
    setNotes("");
    onCreated?.();
  }

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-3 rounded-xl border bg-card p-4">
      <p className="text-sm font-medium text-navy">Training or off-field incident</p>
      <p className="text-sm text-muted-foreground">
        Use this only when there is no fixture. Match cases should be tagged from the event list.
      </p>
      <div>
        <Label htmlFor="train-name">Player</Label>
        <Input id="train-name" value={playerName} onChange={(e) => setPlayerName(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="train-pos">Position</Label>
        <Input id="train-pos" value={position} onChange={(e) => setPosition(e.target.value)} placeholder="Openside flanker" />
      </div>
      <div>
        <Label>Union</Label>
        <select
          className="h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm"
          value={unionId}
          onChange={(e) => setUnionId(e.target.value)}
        >
          {state.unions.map((row) => (
            <option key={row.id} value={row.id}>
              {row.flag} {row.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="train-notes">Incident notes</Label>
        <Textarea id="train-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      <Button type="submit" variant="brand">
        Create case
      </Button>
    </form>
  );
}
