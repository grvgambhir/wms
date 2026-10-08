"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { venuesForCompetition } from "@/lib/tournament-hub";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export function InlineFixtureForm({
  competitionId,
  onCreated,
  defaultRound = "Round 1",
}: {
  competitionId: string;
  onCreated?: () => void;
  defaultRound?: string;
}) {
  const { state, createMatch } = useStore();
  const squads = state.teams.filter((t) => t.competitionIds.includes(competitionId));
  const teams = squads.length >= 2 ? squads : state.teams;
  const competition = state.competitions.find((c) => c.id === competitionId);
  const venues = competition ? venuesForCompetition(state.venues, competition) : [];
  const venueOptions = venues.length ? venues : state.venues;
  const [round, setRound] = useState(defaultRound);
  const [kickoff, setKickoff] = useState("2026-10-04T15:00");
  const [venueId, setVenueId] = useState(venueOptions[0]?.id ?? "");
  const [homeTeamId, setHomeTeamId] = useState(teams[0]?.id ?? "");
  const [awayTeamId, setAwayTeamId] = useState(teams[1]?.id ?? "");
  const [referee, setReferee] = useState("");
  const [feedsRankings, setFeedsRankings] = useState(true);

  const options = useMemo(() => teams, [teams]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!homeTeamId || !awayTeamId || homeTeamId === awayTeamId) {
      toast.error("Pick two different teams.");
      return;
    }
    const id = createMatch({
      competitionId,
      round,
      kickoff: new Date(kickoff).toISOString(),
      venueId,
      homeTeamId,
      awayTeamId,
      referee,
      ar1: "TBC",
      ar2: "TBC",
      tmo: "TBC",
      feedsRankings,
    });
    if (!id) {
      toast.error("Could not create the fixture.");
      return;
    }
    toast.success("Fixture added to this tournament.");
    onCreated?.();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-3 rounded-lg border bg-muted/40 p-4 sm:grid-cols-2">
      <p className="sm:col-span-2 text-sm font-medium text-navy">Add fixture</p>
      <div>
        <Label>Round / stage</Label>
        <Input required value={round} onChange={(e) => setRound(e.target.value)} />
      </div>
      <div>
        <Label>Kick-off</Label>
        <Input type="datetime-local" required value={kickoff} onChange={(e) => setKickoff(e.target.value)} />
      </div>
      <div>
        <Label>Home team</Label>
        <select className={field} required value={homeTeamId} onChange={(e) => setHomeTeamId(e.target.value)}>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.flag} {t.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Away team</Label>
        <select className={field} required value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
          {options.map((t) => (
            <option key={t.id} value={t.id}>
              {t.flag} {t.name}
            </option>
          ))}
        </select>
      </div>
      <div className="sm:col-span-2">
        <Label>Venue</Label>
        <select className={field} required value={venueId} onChange={(e) => setVenueId(e.target.value)}>
          {venueOptions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}, {v.city}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Referee</Label>
        <Input value={referee} onChange={(e) => setReferee(e.target.value)} placeholder="TBC" />
      </div>
      <label className="flex items-end gap-2 pb-2 text-sm">
        <input type="checkbox" checked={feedsRankings} onChange={(e) => setFeedsRankings(e.target.checked)} />
        Feeds rankings
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" variant="brand">
          Save fixture
        </Button>
      </div>
    </form>
  );
}

export function InlineTeamForm({ competitionId }: { competitionId: string }) {
  const { state, createTeam, attachTeamToCompetition } = useStore();
  const attached = new Set(state.teams.filter((t) => t.competitionIds.includes(competitionId)).map((t) => t.id));
  const available = state.teams.filter((t) => !attached.has(t.id));
  const [existingId, setExistingId] = useState(available[0]?.id ?? "");
  const [name, setName] = useState("");
  const [flag, setFlag] = useState("🏉");
  const [coach, setCoach] = useState("");
  const [unionId, setUnionId] = useState(state.unions[0]?.id ?? "");

  function attachExisting(e: FormEvent) {
    e.preventDefault();
    if (!existingId) return;
    attachTeamToCompetition(existingId, competitionId);
    toast.success("Team added to this tournament.");
  }

  function createNew(e: FormEvent) {
    e.preventDefault();
    createTeam({ name, flag, unionId, coach: coach || "TBC", competitionId });
    toast.success(`${name} created in this tournament.`);
    setName("");
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={attachExisting} className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <p className="text-sm font-medium text-navy">Add existing team</p>
        <select className={field} value={existingId} onChange={(e) => setExistingId(e.target.value)}>
          {available.map((t) => (
            <option key={t.id} value={t.id}>
              {t.flag} {t.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="brand" disabled={!existingId}>
          Add to tournament
        </Button>
      </form>
      <form onSubmit={createNew} className="space-y-3 rounded-lg border bg-muted/40 p-4">
        <p className="text-sm font-medium text-navy">Create new team</p>
        <Input required placeholder="Team name" value={name} onChange={(e) => setName(e.target.value)} />
        <Input placeholder="Flag emoji" value={flag} onChange={(e) => setFlag(e.target.value)} />
        <Input placeholder="Coach" value={coach} onChange={(e) => setCoach(e.target.value)} />
        <select className={field} value={unionId} onChange={(e) => setUnionId(e.target.value)}>
          {state.unions.map((u) => (
            <option key={u.id} value={u.id}>
              {u.flag} {u.name}
            </option>
          ))}
        </select>
        <Button type="submit" variant="brand">
          Create team
        </Button>
      </form>
    </div>
  );
}

export function InlinePlayerForm({ teamId, onCreated }: { teamId: string; onCreated?: () => void }) {
  const { state, createPlayer } = useStore();
  const team = state.teams.find((t) => t.id === teamId);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("Centre");
  const [number, setNumber] = useState("16");
  const [club, setClub] = useState("");

  if (!team) return null;
  const current = team;

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createPlayer({
      teamId: current.id,
      unionId: current.unionId,
      name,
      position,
      number: Number(number) || 99,
      dob: "1998-01-01",
      heightCm: 185,
      weightKg: 98,
      club: club || "Unattached",
      caps: 0,
      tries: 0,
      status: "available",
      bio: "Added from HQ tournament operations. Demo profile.",
    });
    toast.success(`${name} added to ${current.name}.`);
    setName("");
    onCreated?.();
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-2 sm:grid-cols-5">
      <Input required placeholder="Player name" value={name} onChange={(e) => setName(e.target.value)} />
      <Input required placeholder="Position" value={position} onChange={(e) => setPosition(e.target.value)} />
      <Input required placeholder="No." value={number} onChange={(e) => setNumber(e.target.value)} />
      <Input placeholder="Club" value={club} onChange={(e) => setClub(e.target.value)} />
      <Button type="submit" variant="brand">
        Add player
      </Button>
    </form>
  );
}
