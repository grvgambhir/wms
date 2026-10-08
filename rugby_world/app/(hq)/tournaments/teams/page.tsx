"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

export default function TeamsPage() {
  const { state } = useStore();
  const [q, setQ] = useState("");
  const [comp, setComp] = useState("all");
  const teams = useMemo(() => {
    return state.teams.filter((t) => {
      if (comp !== "all" && !t.competitionIds.includes(comp)) return false;
      if (q && !t.name.toLowerCase().includes(q.toLowerCase())) return false;
      return true;
    });
  }, [state.teams, q, comp]);

  return (
    <div>
      <PageHeader
        eyebrow="Tournament Management"
        title="Teams"
        description="National squads entered for World Rugby competitions."
        back={{ href: "/tournaments", label: "Back to tournaments" }}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="max-w-xs" placeholder="Search teams" value={q} onChange={(e) => setQ(e.target.value)} />
        <select
          className="h-8 rounded-lg border border-input bg-white px-2 text-sm"
          value={comp}
          onChange={(e) => setComp(e.target.value)}
        >
          <option value="all">All competitions</option>
          {state.competitions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.shortName}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {teams.map((t) => {
          const count = state.players.filter((p) => p.teamId === t.id).length;
          return (
            <Link key={t.id} href={`/tournaments/teams/${t.id}`}>
              <Card className="h-full hover:shadow-md">
                <CardContent>
                  <p className="text-2xl">{t.flag}</p>
                  <h2 className="mt-1 text-lg font-semibold text-navy">{t.name}</h2>
                  <p className="text-sm text-muted-foreground">Coach {t.coach}</p>
                  <p className="mt-2 text-xs text-muted-foreground">
                    {count} players · {t.pool ?? "No pool"} · {t.competitionIds.length} competitions
                  </p>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
