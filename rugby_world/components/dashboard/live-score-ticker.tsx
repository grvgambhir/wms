"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";

export function LiveScoreTicker() {
  const { state } = useStore();
  const live = state.matches.filter((m) => m.status === "live");

  if (live.length === 0) {
    return (
      <div className="overflow-hidden rounded-xl bg-navy px-4 py-2 text-white">
        <p className="text-xs font-semibold tracking-[0.18em] text-gold uppercase">Live scores</p>
        <p className="text-sm text-white/80">No matches in play. Live fixtures will tick along this bar.</p>
      </div>
    );
  }

  const items = live.map((m) => {
    const competition = state.competitions.find((c) => c.id === m.competitionId);
    return {
      id: m.id,
      href: `/tournaments/matches/${m.id}`,
      label: `${m.homeFlag} ${m.homeTeam} ${m.homeScore ?? 0}-${m.awayScore ?? 0} ${m.awayTeam} ${m.awayFlag}`,
      meta: `${competition?.shortName ?? "Match"} · ${m.round}`,
    };
  });
  const loop = [...items, ...items];

  return (
    <div className="overflow-hidden rounded-xl bg-navy text-white">
      <div className="flex items-center gap-3 px-4 py-2">
        <span className="shrink-0 rounded-full bg-red-500 px-2 py-0.5 text-[10px] font-bold tracking-widest uppercase">
          Live
        </span>
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="live-ticker-track gap-10">
            {loop.map((item, index) => (
              <Link
                key={`${item.id}-${index}`}
                href={item.href}
                className="flex shrink-0 items-baseline gap-2 whitespace-nowrap hover:text-gold"
              >
                <span className="font-medium">{item.label}</span>
                <span className="text-xs text-white/60">{item.meta}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
