"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export function ConcussionEntryForm({
  matchId,
  defaultMinute,
  onCreated,
}: {
  matchId: string;
  defaultMinute?: number;
  onCreated?: (id: string) => void;
}) {
  const { state, createConcussionCase } = useStore();
  const match = state.matches.find((row) => row.id === matchId);
  const competition = state.competitions.find((row) => row.id === match?.competitionId);
  const homeSquad = useMemo(
    () => state.players.filter((p) => p.teamId === match?.homeTeamId).sort((a, b) => a.number - b.number),
    [match?.homeTeamId, state.players]
  );
  const awaySquad = useMemo(
    () => state.players.filter((p) => p.teamId === match?.awayTeamId).sort((a, b) => a.number - b.number),
    [match?.awayTeamId, state.players]
  );
  const [side, setSide] = useState<"home" | "away">("home");
  const [playerId, setPlayerId] = useState("");
  const [customName, setCustomName] = useState("");
  const [minute, setMinute] = useState(defaultMinute != null ? String(defaultMinute) : "");
  const [notes, setNotes] = useState("");

  if (!match) return <p className="text-sm text-muted-foreground">Match not found.</p>;
  const fixture = match;

  const squad = side === "home" ? homeSquad : awaySquad;
  const pickedPlayer = state.players.find((player) => player.id === playerId);
  const pickedTeam = pickedPlayer
    ? state.teams.find((team) => team.id === pickedPlayer.teamId)
    : state.teams.find((team) => team.id === (side === "home" ? match.homeTeamId : match.awayTeamId));
  const pickedUnion = pickedPlayer
    ? state.unions.find((union) => union.id === pickedPlayer.unionId)
    : state.unions.find((union) => union.id === pickedTeam?.unionId);
  const taggedIds = new Set(
    state.cases
      .filter(
        (row) =>
          row.matchId === match.id &&
          row.playerId &&
          row.diagnosis !== "closed" &&
          row.diagnosis !== "cleared"
      )
      .map((row) => row.playerId)
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = pickedPlayer?.name || customName.trim();
    if (!name) {
      toast.error("Select a player from the match-day squad.");
      return;
    }
    if (
      pickedPlayer &&
      state.cases.some(
        (row) =>
          row.playerId === pickedPlayer.id &&
          row.matchId === fixture.id &&
          row.diagnosis !== "closed" &&
          row.diagnosis !== "cleared"
      )
    ) {
      toast.message("This player is already on the concussion list for that match.");
      return;
    }
    const parsedMinute = minute.trim() === "" ? undefined : Number(minute);
    if (parsedMinute != null && !Number.isFinite(parsedMinute)) {
      toast.error("Enter a valid match minute.");
      return;
    }
    const matchLabel = `${competition?.shortName ?? "Match"} · ${fixture.homeTeam} v ${fixture.awayTeam}${
      parsedMinute != null ? ` · ${parsedMinute}'` : ""
    }`;
    const id = createConcussionCase({
      player: name,
      playerId: pickedPlayer?.id,
      position: pickedPlayer?.position || "Unknown",
      unionId: pickedPlayer?.unionId || pickedUnion?.id || "",
      unionName: pickedUnion?.name || pickedTeam?.name || "Unknown union",
      teamName: pickedTeam?.name ?? (side === "home" ? fixture.homeTeam : fixture.awayTeam),
      teamFlag: pickedTeam?.flag ?? (side === "home" ? fixture.homeFlag : fixture.awayFlag),
      matchId: fixture.id,
      matchLabel,
      competitionId: fixture.competitionId,
      minute: parsedMinute,
      notes,
      source: "match",
    });
    if (!id) {
      toast.error("Could not open the case.");
      return;
    }
    toast.success(`${name} added to the concussion list.`);
    setPlayerId("");
    setCustomName("");
    setNotes("");
    onCreated?.(id);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium",
            side === "home" ? "border-navy bg-navy text-white" : "hover:bg-muted/60"
          )}
          onClick={() => {
            setSide("home");
            setPlayerId("");
          }}
        >
          {match.homeFlag} {match.homeTeam}
        </button>
        <button
          type="button"
          className={cn(
            "rounded-lg border px-3 py-2 text-sm font-medium",
            side === "away" ? "border-navy bg-navy text-white" : "hover:bg-muted/60"
          )}
          onClick={() => {
            setSide("away");
            setPlayerId("");
          }}
        >
          {match.awayFlag} {match.awayTeam}
        </button>
      </div>
      {squad.length === 0 ? (
        <div>
          <Label htmlFor="hia-custom">Player name</Label>
          <Input
            id="hia-custom"
            value={customName}
            onChange={(e) => setCustomName(e.target.value)}
            placeholder="Squad list not loaded for this team"
          />
        </div>
      ) : (
        <div className="grid max-h-56 gap-1 overflow-y-auto rounded-lg border p-1 sm:grid-cols-2">
          {squad.map((player) => {
            const tagged = taggedIds.has(player.id);
            return (
              <button
                key={player.id}
                type="button"
                disabled={tagged}
                onClick={() => setPlayerId(player.id)}
                className={cn(
                  "rounded-md px-3 py-2 text-left text-sm",
                  tagged && "cursor-not-allowed opacity-45",
                  playerId === player.id ? "bg-navy text-white" : "hover:bg-muted/70"
                )}
              >
                <span className="mr-2 inline-block w-6 tabular-nums text-muted-foreground">
                  {player.number}
                </span>
                {player.name}
                {tagged ? <span className="ml-2 text-[11px] uppercase tracking-wide">On list</span> : null}
              </button>
            );
          })}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-[7rem_1fr]">
        <div>
          <Label htmlFor="hia-min">Minute</Label>
          <Input
            id="hia-min"
            inputMode="numeric"
            value={minute}
            onChange={(e) => setMinute(e.target.value)}
            placeholder={defaultMinute != null ? String(defaultMinute) : "14"}
          />
        </div>
        <div>
          <Label htmlFor="hia-notes">Incident notes</Label>
          <Textarea
            id="hia-notes"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Mechanism, signs, removed from play"
          />
        </div>
      </div>
      <Button type="submit" variant="brand">
        Tag to concussion list
      </Button>
    </form>
  );
}
