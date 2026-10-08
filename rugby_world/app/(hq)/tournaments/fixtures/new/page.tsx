"use client";

import { FormEvent, Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function NewFixtureForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { state, createMatch } = useStore();
  const preset = searchParams.get("competition") ?? state.competitions[0]?.id ?? "";
  const [competitionId, setCompetitionId] = useState(preset);
  const [round, setRound] = useState("Round 1");
  const [kickoff, setKickoff] = useState("2026-10-04T15:00");
  const [venueId, setVenueId] = useState(state.venues[0]?.id ?? "");
  const [homeTeamId, setHomeTeamId] = useState("");
  const [awayTeamId, setAwayTeamId] = useState("");
  const [referee, setReferee] = useState("");
  const [ar1, setAr1] = useState("");
  const [ar2, setAr2] = useState("");
  const [tmo, setTmo] = useState("");
  const [feedsRankings, setFeedsRankings] = useState(true);

  const teams = useMemo(() => {
    const inComp = state.teams.filter((t) => t.competitionIds.includes(competitionId));
    return inComp.length ? inComp : state.teams;
  }, [state.teams, competitionId]);

  const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (homeTeamId === awayTeamId) {
      toast.error("Home and away teams must be different.");
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
      ar1,
      ar2,
      tmo,
      feedsRankings,
    });
    if (!id) {
      toast.error("Could not create fixture. Check team selection.");
      return;
    }
    toast.success("Fixture created.");
    router.push(`/tournaments/matches/${id}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tournament Management"
        title="Create fixture"
        description="Schedule a match, assign venue and officials. Results can be entered from match centre."
        back={{ href: "/tournaments", label: "Back to tournaments" }}
      />
      <form onSubmit={onSubmit} className="max-w-2xl space-y-4 rounded-xl border bg-card p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label>Competition</Label>
            <select className={field} value={competitionId} onChange={(e) => setCompetitionId(e.target.value)} required>
              {state.competitions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
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
              <option value="">Select</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.flag} {t.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label>Away team</Label>
            <select className={field} required value={awayTeamId} onChange={(e) => setAwayTeamId(e.target.value)}>
              <option value="">Select</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.flag} {t.name}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <Label>Venue</Label>
            <select className={field} required value={venueId} onChange={(e) => setVenueId(e.target.value)}>
              {state.venues.map((v) => (
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
          <div>
            <Label>TMO</Label>
            <Input value={tmo} onChange={(e) => setTmo(e.target.value)} placeholder="TBC" />
          </div>
          <div>
            <Label>Assistant 1</Label>
            <Input value={ar1} onChange={(e) => setAr1(e.target.value)} placeholder="TBC" />
          </div>
          <div>
            <Label>Assistant 2</Label>
            <Input value={ar2} onChange={(e) => setAr2(e.target.value)} placeholder="TBC" />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={feedsRankings} onChange={(e) => setFeedsRankings(e.target.checked)} />
          Feeds World Rugby Rankings
        </label>
        <Button type="submit" variant="brand">
          Create fixture
        </Button>
      </form>
    </div>
  );
}

export default function NewFixturePage() {
  return (
    <Suspense fallback={<p className="text-sm text-muted-foreground">Loading fixture form…</p>}>
      <NewFixtureForm />
    </Suspense>
  );
}
