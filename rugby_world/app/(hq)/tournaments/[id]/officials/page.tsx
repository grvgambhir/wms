"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { OpsSection } from "@/components/tournaments/ops-section";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { matchOfficialsReady } from "@/lib/tournament-hub";
import type { Match, MatchOfficials } from "@/lib/types";

function OfficialsRow({ match }: { match: Match }) {
  const { updateMatchOfficials } = useStore();
  const [officials, setOfficials] = useState<MatchOfficials>(match.officials);
  const ready = matchOfficialsReady({ ...match, officials });

  function onSave(e: FormEvent) {
    e.preventDefault();
    updateMatchOfficials(match.id, {
      referee: officials.referee.trim() || "TBC",
      ar1: officials.ar1.trim() || "TBC",
      ar2: officials.ar2.trim() || "TBC",
      tmo: officials.tmo.trim() || "TBC",
    });
    toast.success(`Panel saved for ${match.homeTeam} v ${match.awayTeam}.`);
  }

  return (
    <form onSubmit={onSave} className="grid gap-2 rounded-lg border bg-card px-3 py-3 sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto]">
      <div>
        <p className="font-medium text-navy">
          {match.homeTeam} v {match.awayTeam}
        </p>
        <p className="text-xs text-muted-foreground">{match.round}</p>
      </div>
      <Input
        value={officials.referee}
        onChange={(e) => setOfficials((row) => ({ ...row, referee: e.target.value }))}
        placeholder="Referee"
        aria-label="Referee"
      />
      <Input
        value={officials.ar1}
        onChange={(e) => setOfficials((row) => ({ ...row, ar1: e.target.value }))}
        placeholder="AR1"
        aria-label="Assistant referee 1"
      />
      <Input
        value={officials.ar2}
        onChange={(e) => setOfficials((row) => ({ ...row, ar2: e.target.value }))}
        placeholder="AR2"
        aria-label="Assistant referee 2"
      />
      <Input
        value={officials.tmo}
        onChange={(e) => setOfficials((row) => ({ ...row, tmo: e.target.value }))}
        placeholder="TMO"
        aria-label="TMO"
      />
      <Button type="submit" size="sm" variant={ready ? "outline" : "brand"}>
        Save
      </Button>
    </form>
  );
}

export default function OfficialsPage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const matches = state.matches.filter((m) => m.competitionId === id);
  const pending = matches.filter((m) => !matchOfficialsReady(m)).length;

  return (
    <div className="space-y-8">
      <OpsSection competitionId={id} module="officials" />
      <div>
        <div className="mb-3">
          <h3 className="font-heading text-lg font-semibold text-navy">Match appointments</h3>
          <p className="text-sm text-muted-foreground">
            {matches.length === 0
              ? "Build fixtures first, then appoint a referee, assistants and TMO for each match."
              : pending > 0
                ? `${pending} ${pending === 1 ? "match still needs" : "matches still need"} a referee.`
                : "Every match has a referee named."}
          </p>
        </div>
        {matches.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Appointments appear here once fixtures are on the{" "}
            <Link href={`/tournaments/${id}/fixtures`} className="text-navy underline">
              fixtures
            </Link>
            .
          </p>
        ) : (
          <div className="space-y-2">
            <div className="hidden text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase sm:grid sm:grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))_auto] sm:gap-2 sm:px-3">
              <span>Match</span>
              <span>Referee</span>
              <span>AR1</span>
              <span>AR2</span>
              <span>TMO</span>
              <span />
            </div>
            {matches.map((m) => (
              <OfficialsRow key={m.id} match={m} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
