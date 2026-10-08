"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useStore } from "@/lib/store";
import { SCORE_LABELS, playerScoringStats } from "@/lib/match-card";
import { StatusBadge } from "@/components/shared/page-header";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type Ctx = { openPlayer: (id: string) => void };

const PlayerStatsContext = createContext<Ctx | null>(null);

export function usePlayerStats() {
  const ctx = useContext(PlayerStatsContext);
  if (!ctx) throw new Error("usePlayerStats must be used within PlayerStatsProvider");
  return ctx;
}

export function PlayerName({
  id,
  children,
  className,
}: {
  id: string;
  children: ReactNode;
  className?: string;
}) {
  const { openPlayer } = usePlayerStats();
  return (
    <button
      type="button"
      onClick={() => openPlayer(id)}
      className={cn("cursor-pointer font-medium text-navy hover:underline", className)}
    >
      {children}
    </button>
  );
}

function hue(seed: string) {
  let n = 0;
  for (let i = 0; i < seed.length; i += 1) n = (n * 33 + seed.charCodeAt(i)) >>> 0;
  return n % 360;
}

function PlayerPortrait({
  name,
  number,
  flag,
}: {
  name: string;
  number: number;
  flag: string;
}) {
  const h = hue(name);
  const skin = `hsl(${30 + (h % 25)}, 42%, ${62 + (h % 12)}%)`;
  const hair = `hsl(${20 + (h % 40)}, 35%, ${18 + (h % 16)}%)`;
  const initials = name
    .split(" ")
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();

  return (
    <div className="relative mx-auto size-28 shrink-0 sm:mx-0 sm:size-32">
      <svg viewBox="0 0 120 120" className="size-full overflow-hidden rounded-2xl shadow-md">
        <defs>
          <linearGradient id={`kit-${number}-${h}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00256e" />
            <stop offset="55%" stopColor="#006e88" />
            <stop offset="100%" stopColor="#0a9a72" />
          </linearGradient>
        </defs>
        <rect width="120" height="120" fill={`url(#kit-${number}-${h})`} />
        <circle cx="60" cy="38" r="18" fill={skin} />
        <ellipse cx="60" cy="26" rx="16" ry="10" fill={hair} />
        <path d="M32 118 C32 78 88 78 88 118" fill={skin} />
        <path d="M28 118 C28 86 92 86 92 118" fill="#001b4d" />
        <text
          x="60"
          y="108"
          textAnchor="middle"
          fill="white"
          fontSize="22"
          fontWeight="700"
          fontFamily="ui-sans-serif, system-ui"
        >
          {number}
        </text>
      </svg>
      <span className="absolute -right-1 -bottom-1 flex size-10 items-center justify-center rounded-full bg-white text-2xl shadow">
        {flag}
      </span>
      <span className="sr-only">{initials}</span>
    </div>
  );
}

function BarGraph({
  rows,
}: {
  rows: { label: string; value: number; color: string }[];
}) {
  const max = Math.max(...rows.map((row) => row.value), 1);
  return (
    <div className="space-y-2.5">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="mb-1 flex items-center justify-between text-xs">
            <span className="text-muted-foreground">{row.label}</span>
            <span className="tabular-nums font-medium text-navy">{row.value}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full transition-[width]"
              style={{ width: `${Math.max((row.value / max) * 100, row.value ? 8 : 0)}%`, background: row.color }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

function Donut({
  slices,
}: {
  slices: { label: string; value: number; color: string }[];
}) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  const r = 36;
  const c = 2 * Math.PI * r;
  let offset = 0;
  if (total === 0) {
    return (
      <div className="flex h-[120px] items-center justify-center text-xs text-muted-foreground">
        No HQ scoring yet
      </div>
    );
  }
  return (
    <div className="flex items-center gap-4">
      <svg viewBox="0 0 100 100" className="size-[120px] -rotate-90">
        {slices
          .filter((slice) => slice.value > 0)
          .map((slice) => {
            const len = (slice.value / total) * c;
            const dash = `${len} ${c - len}`;
            const el = (
              <circle
                key={slice.label}
                cx="50"
                cy="50"
                r={r}
                fill="none"
                stroke={slice.color}
                strokeWidth="14"
                strokeDasharray={dash}
                strokeDashoffset={-offset}
              />
            );
            offset += len;
            return el;
          })}
      </svg>
      <ul className="space-y-1 text-xs">
        {slices.map((slice) => (
          <li key={slice.label} className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: slice.color }} />
            <span className="text-muted-foreground">{slice.label}</span>
            <span className="tabular-nums font-medium text-navy">{slice.value}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlayerStatsCard({ playerId }: { playerId: string }) {
  const { state } = useStore();
  const player = state.players.find((p) => p.id === playerId);
  const team = state.teams.find((t) => t.id === player?.teamId);
  const union = state.unions.find((u) => u.id === player?.unionId);
  const stats = player ? playerScoringStats(player, state.matches) : null;

  if (!player || !team || !stats) {
    return <p className="text-sm text-muted-foreground">Player not found.</p>;
  }

  const scoringBars = [
    { label: "Tries", value: stats.tries, color: "#001b4d" },
    { label: "Conversions", value: stats.conversions, color: "#006e88" },
    { label: "Penalties", value: stats.penalties, color: "#c9a227" },
    { label: "Drop goals", value: stats.dropGoals, color: "#0a9a72" },
  ];
  const careerBars = [
    { label: "Caps", value: player.caps, color: "#001b4d" },
    { label: "Career tries", value: player.tries, color: "#c9a227" },
    { label: "HQ appearances", value: stats.appearances, color: "#006e88" },
    { label: "HQ points", value: stats.points, color: "#0a9a72" },
  ];
  const donut = [
    { label: "Tries", value: stats.tries * 5, color: "#001b4d" },
    { label: "Conversions", value: stats.conversions * 2, color: "#006e88" },
    { label: "Penalties", value: stats.penalties * 3, color: "#c9a227" },
    { label: "Drop goals", value: stats.dropGoals * 3, color: "#0a9a72" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
        <PlayerPortrait name={player.name} number={player.number} flag={team.flag} />
        <div className="min-w-0 text-center sm:text-left">
          <p className="text-[11px] font-semibold tracking-[0.18em] text-gold uppercase">
            {union?.country ?? team.name} · #{player.number}
          </p>
          <h2 className="font-heading text-2xl font-semibold text-navy">{player.name}</h2>
          <p className="text-sm text-muted-foreground">
            {player.position} · {player.club}
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 sm:justify-start">
            <span className="text-lg">{team.flag}</span>
            <span className="text-sm font-medium text-navy">{team.name}</span>
            <StatusBadge status={player.status} />
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Career load
          </h3>
          <BarGraph rows={careerBars} />
        </section>
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Points mix (HQ)
          </h3>
          <Donut slices={donut} />
        </section>
      </div>

      <section>
        <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
          Scoring plays
        </h3>
        <BarGraph rows={scoringBars} />
      </section>

      {stats.plays.length > 0 && (
        <section>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
            Recent scoring
          </h3>
          <ul className="max-h-32 space-y-1 overflow-auto text-sm">
            {stats.plays.slice(-6).reverse().map((play, index) => (
              <li key={`${play.matchId}-${index}`} className="flex justify-between gap-2 rounded-md bg-muted/50 px-2 py-1">
                <span>
                  {SCORE_LABELS[play.kind]} {play.minute}&apos;
                </span>
                <span className="truncate text-muted-foreground">{play.label}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

export function PlayerStatsProvider({ children }: { children: ReactNode }) {
  const [playerId, setPlayerId] = useState<string | null>(null);
  const openPlayer = useCallback((id: string) => setPlayerId(id), []);
  const value = useMemo(() => ({ openPlayer }), [openPlayer]);

  return (
    <PlayerStatsContext.Provider value={value}>
      {children}
      <Dialog open={Boolean(playerId)} onOpenChange={(next) => !next && setPlayerId(null)}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Player stats</DialogTitle>
            <DialogDescription>Match record and scoring for this squad member.</DialogDescription>
          </DialogHeader>
          {playerId && <PlayerStatsCard playerId={playerId} />}
        </DialogContent>
      </Dialog>
    </PlayerStatsContext.Provider>
  );
}
