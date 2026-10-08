"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { KpiCard, PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { SCORE_LABELS, playerScoringStats } from "@/lib/match-card";
import type { PlayerStatus } from "@/lib/types";

function ageYears(dob: string) {
  const born = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const month = now.getMonth() - born.getMonth();
  if (month < 0 || (month === 0 && now.getDate() < born.getDate())) age -= 1;
  return age;
}

export default function PlayerProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { state, updatePlayer } = useStore();
  const player = state.players.find((p) => p.id === id);
  const team = state.teams.find((t) => t.id === player?.teamId);
  const union = state.unions.find((u) => u.id === player?.unionId);
  const cases = state.cases.filter(
    (c) => c.player === player?.name || (player && c.unionId === player.unionId && c.player.includes(player.name.split(" ")[0]))
  );
  const matches = state.matches.filter(
    (m) => m.homeTeamId === player?.teamId || m.awayTeamId === player?.teamId || m.homeTeam === team?.name || m.awayTeam === team?.name
  );
  const stats = player ? playerScoringStats(player, state.matches) : null;
  const [status, setStatus] = useState<PlayerStatus>(player?.status ?? "available");
  const [bio, setBio] = useState(player?.bio ?? "");

  if (!player || !team || !stats) return <p>Player not found.</p>;

  function onSave(e: FormEvent) {
    e.preventDefault();
    if (!player) return;
    updatePlayer({ ...player, status, bio });
    toast.success("Player profile updated.");
  }

  return (
    <div>
      <PageHeader
        eyebrow={`${team.flag} ${team.name} · #${player.number}`}
        title={player.name}
        description={`${player.position} · ${player.club}`}
        actions={<StatusBadge status={player.status} />}
        back={
          union
            ? { href: `/members/${union.id}`, label: `Back to ${union.name} team file` }
            : { href: `/tournaments/teams/${team.id}`, label: `Back to ${team.name}` }
        }
      />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <KpiCard label="Caps" value={player.caps} hint="Career" />
        <KpiCard label="Career tries" value={player.tries} />
        <KpiCard label="HQ points" value={stats.points} hint="Recorded scoring plays" />
        <KpiCard label="Tries (HQ)" value={stats.tries} />
        <KpiCard label="Appearances" value={stats.appearances} hint="Live or completed HQ fixtures" />
        <KpiCard label="Age" value={ageYears(player.dob)} hint={formatDate(player.dob)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Player stats</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <dl className="grid gap-3 text-sm sm:grid-cols-4">
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">Tries</dt>
                <dd className="font-heading text-2xl font-semibold text-navy">{stats.tries}</dd>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">Conversions</dt>
                <dd className="font-heading text-2xl font-semibold text-navy">{stats.conversions}</dd>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">Penalties</dt>
                <dd className="font-heading text-2xl font-semibold text-navy">{stats.penalties}</dd>
              </div>
              <div className="rounded-lg bg-muted/60 px-3 py-2">
                <dt className="text-xs text-muted-foreground">Drop goals</dt>
                <dd className="font-heading text-2xl font-semibold text-navy">{stats.dropGoals}</dd>
              </div>
            </dl>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-navy">Scoring log</h3>
              {stats.plays.length === 0 ? (
                <p className="text-sm text-muted-foreground">No tries, kicks or other scoring plays recorded in HQ yet.</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {stats.plays.map((play, index) => (
                    <li key={`${play.matchId}-${play.minute}-${index}`}>
                      <Link
                        href={`/tournaments/matches/${play.matchId}`}
                        className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-muted/60"
                      >
                        <span>
                          <span className="font-medium text-navy">{SCORE_LABELS[play.kind]}</span>
                          <span className="text-muted-foreground"> · {play.minute}&apos; · {play.label}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">{play.points} pts · {play.round}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <dl className="grid gap-3 border-t pt-4 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-muted-foreground">Height / weight</dt>
                <dd>
                  {player.heightCm} cm · {player.weightKg} kg
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Union</dt>
                <dd>
                  {union ? (
                    <Link href={`/members/${union.id}`} className="text-navy hover:underline">
                      {union.name}
                    </Link>
                  ) : (
                    team.name
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Team file</dt>
                <dd>
                  <Link href={`/tournaments/teams/${team.id}`} className="text-navy hover:underline">
                    {team.flag} {team.name}
                  </Link>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Club</dt>
                <dd>{player.club}</dd>
              </div>
            </dl>

            <form onSubmit={onSave} className="space-y-3 border-t pt-4">
              <div>
                <Label>Availability</Label>
                <select
                  className="mt-1 h-10 w-full rounded-lg border px-2 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as PlayerStatus)}
                >
                  <option value="available">Available</option>
                  <option value="injured">Injured</option>
                  <option value="hia">HIA / concussion</option>
                  <option value="suspended">Suspended</option>
                </select>
              </div>
              <div>
                <Label>HQ notes</Label>
                <Textarea rows={4} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
              <Button type="submit" variant="brand">
                Save profile
              </Button>
            </form>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Fixtures</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {matches.length === 0 && <p className="text-muted-foreground">No fixtures linked yet.</p>}
              {matches.slice(0, 6).map((m) => (
                <Link key={m.id} href={`/tournaments/matches/${m.id}`} className="block rounded-md border px-3 py-2 hover:bg-muted">
                  {m.homeTeam} v {m.awayTeam}
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    {m.round}
                    {m.status !== "scheduled" && m.homeScore != null && m.awayScore != null
                      ? ` · ${m.homeScore}-${m.awayScore}`
                      : ""}
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Medical</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              {cases.length === 0 && <p className="text-muted-foreground">No concussion cases on file.</p>}
              {cases.map((c) => (
                <Link key={c.id} href={`/concussion/${c.id}`} className="block rounded-md border px-3 py-2 hover:bg-muted">
                  {c.matchLabel}
                  <span className="mt-0.5 block">
                    <StatusBadge status={c.rtpOverall} />
                  </span>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
