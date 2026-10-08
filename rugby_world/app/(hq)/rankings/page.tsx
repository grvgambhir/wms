"use client";

import { useMemo, useState } from "react";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { projectExchange, type MatchResult } from "@/lib/ranking-engine";
import type { RankingCategory } from "@/lib/types";

const TABS: { id: RankingCategory; label: string }[] = [
  { id: "mens-15s", label: "Men’s 15s" },
  { id: "womens-15s", label: "Women’s 15s" },
  { id: "mens-7s", label: "Men’s Sevens" },
  { id: "womens-7s", label: "Women’s Sevens" },
];

function Sparkline({ values }: { values: number[] }) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const w = 72;
  const h = 28;
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(values.length - 1, 1)) * w;
      const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
      return `${x},${y}`;
    })
    .join(" ");
  const up = values[values.length - 1] >= values[0];
  return (
    <svg width={w} height={h} className={up ? "text-emerald-700" : "text-red-700"}>
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

export default function RankingsPage() {
  const { state } = useStore();
  const [tab, setTab] = useState<RankingCategory>("mens-15s");
  const table = state.rankings[tab];
  const [home, setHome] = useState(table[4]?.team ?? table[0].team);
  const [away, setAway] = useState(table[14]?.team ?? table[1].team);
  const [result, setResult] = useState<MatchResult>("home");
  const [homeAdv, setHomeAdv] = useState(true);
  const [worldCup, setWorldCup] = useState(false);
  const [margin16, setMargin16] = useState(false);

  const projection = useMemo(() => {
    const h = table.find((t) => t.team === home);
    const a = table.find((t) => t.team === away);
    if (!h || !a || home === away) return null;
    return {
      home: h,
      away: a,
      ...projectExchange(h.points, a.points, result, { homeAdvantage: homeAdv, worldCup, margin16 }),
    };
  }, [table, home, away, result, homeAdv, worldCup, margin16]);

  return (
    <div>
      <PageHeader
        eyebrow="Module 05"
        title="World Rugby Rankings"
        description="Official ranking tables operated from HQ. Enter a tournament result to see live movement, or use the calculator."
      />
      <div className="mb-4 flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setTab(t.id);
              const next = state.rankings[t.id];
              setHome(next[0].team);
              setAway(next[Math.min(3, next.length - 1)].team);
            }}
            className={`rounded-md px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-white text-navy shadow-sm" : "text-muted-foreground"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-3">
        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Current table</CardTitle>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="pb-2">#</th>
                  <th className="pb-2">Team</th>
                  <th className="pb-2">Pts</th>
                  <th className="pb-2">Trend</th>
                  <th className="pb-2">5 weeks</th>
                </tr>
              </thead>
              <tbody>
                {table.map((row) => {
                  const move = row.previousRank - row.rank;
                  return (
                    <tr key={row.id} className="border-t">
                      <td className="py-2 tabular-nums">{row.rank}</td>
                      <td>
                        {row.flag} {row.team}
                      </td>
                      <td className="tabular-nums">{row.points.toFixed(tab.endsWith("7s") ? 0 : 2)}</td>
                      <td className={move > 0 ? "text-emerald-700" : move < 0 ? "text-red-700" : "text-muted-foreground"}>
                        {move > 0 ? `↑${move}` : move < 0 ? `↓${Math.abs(move)}` : "-"}
                      </td>
                      <td>
                        <Sparkline values={row.history} />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>What-if calculator</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <p className="text-muted-foreground">
              Simplified World Rugby exchange: home advantage +3, rating gap capped at 10, 2 pts (3 in a World Cup), 1.5× if margin ≥ 16.
            </p>
            <label className="block">
              Home
              <select className="mt-1 h-8 w-full rounded-lg border px-2" value={home} onChange={(e) => setHome(e.target.value)}>
                {table.map((t) => (
                  <option key={t.id}>{t.team}</option>
                ))}
              </select>
            </label>
            <label className="block">
              Away
              <select className="mt-1 h-8 w-full rounded-lg border px-2" value={away} onChange={(e) => setAway(e.target.value)}>
                {table.map((t) => (
                  <option key={t.id}>{t.team}</option>
                ))}
              </select>
            </label>
            <div className="flex gap-2">
              {(["home", "draw", "away"] as MatchResult[]).map((r) => (
                <Button key={r} size="sm" variant={result === r ? "default" : "outline"} onClick={() => setResult(r)}>
                  {r === "home" ? "Home win" : r === "away" ? "Away win" : "Draw"}
                </Button>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={homeAdv} onChange={(e) => setHomeAdv(e.target.checked)} /> Home advantage
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={worldCup} onChange={(e) => setWorldCup(e.target.checked)} /> World Cup weighting
            </label>
            <label className="flex items-center gap-2 text-xs">
              <input type="checkbox" checked={margin16} onChange={(e) => setMargin16(e.target.checked)} /> Winning margin 16+
            </label>
            {projection && (
              <div className="rounded-lg bg-navy p-3 text-white">
                <p>
                  {projection.home.flag} {projection.home.team}{" "}
                  <strong>
                    {projection.homeDelta >= 0 ? "+" : ""}
                    {projection.homeDelta.toFixed(2)}
                  </strong>
                </p>
                <p className="mt-1">
                  {projection.away.flag} {projection.away.team}{" "}
                  <strong>
                    {projection.awayDelta >= 0 ? "+" : ""}
                    {projection.awayDelta.toFixed(2)}
                  </strong>
                </p>
                <p className="mt-2 text-[11px] text-white/70">
                  New totals: {(projection.home.points + projection.homeDelta).toFixed(2)} / {(projection.away.points + projection.awayDelta).toFixed(2)}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
