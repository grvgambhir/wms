"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlayerName } from "@/components/players/player-stats";

export default function TeamPage() {
  const { id } = useParams<{ id: string }>();
  const { state, createPlayer } = useStore();
  const team = state.teams.find((t) => t.id === id);
  const players = state.players.filter((p) => p.teamId === id).sort((a, b) => a.number - b.number);
  const union = state.unions.find((u) => u.id === team?.unionId);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [position, setPosition] = useState("Centre");
  const [number, setNumber] = useState("16");
  const [club, setClub] = useState("");

  if (!team) return <p>Team not found.</p>;

  function onAdd(e: FormEvent) {
    e.preventDefault();
    if (!team) return;
    createPlayer({
      teamId: team.id,
      unionId: team.unionId,
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
    toast.success(`${name} added to ${team.name}.`);
    setName("");
    setOpen(false);
  }

  return (
    <div>
      <PageHeader
        eyebrow={team.pool ?? "National team"}
        title={`${team.flag} ${team.name}`}
        description={`Head coach ${team.coach}${union ? ` · ${union.name}` : ""}`}
        actions={
          <Button type="button" variant="brand" onClick={() => setOpen((v) => !v)}>
            Add player
          </Button>
        }
        back={{
          href: `/members/${team.unionId}`,
          label: union ? `Back to ${union.name} team file` : "Back to member association",
        }}
      />
      {open && (
        <form onSubmit={onAdd} className="mb-6 grid gap-3 rounded-xl border bg-card p-4 sm:grid-cols-5">
          <div>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Position</Label>
            <Input required value={position} onChange={(e) => setPosition(e.target.value)} />
          </div>
          <div>
            <Label>No.</Label>
            <Input required value={number} onChange={(e) => setNumber(e.target.value)} />
          </div>
          <div>
            <Label>Club</Label>
            <Input value={club} onChange={(e) => setClub(e.target.value)} />
          </div>
          <div className="flex items-end">
            <Button type="submit" variant="brand" className="w-full">
              Save player
            </Button>
          </div>
        </form>
      )}
      <div className="mb-4 flex flex-wrap gap-2 text-xs">
        {team.competitionIds.map((cid) => {
          const c = state.competitions.find((x) => x.id === cid);
          return c ? (
            <Link key={cid} href={`/tournaments/${cid}`} className="rounded-full bg-muted px-2 py-1 text-navy">
              {c.shortName}
            </Link>
          ) : null;
        })}
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Squad ({players.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="pb-2">No.</th>
                <th className="pb-2">Player</th>
                <th className="pb-2">Position</th>
                <th className="pb-2">Club</th>
                <th className="pb-2">Caps</th>
                <th className="pb-2">Status</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="py-2 tabular-nums">{p.number}</td>
                  <td>
                    <PlayerName id={p.id}>{p.name}</PlayerName>
                  </td>
                  <td>{p.position}</td>
                  <td className="text-muted-foreground">{p.club}</td>
                  <td className="tabular-nums">{p.caps}</td>
                  <td>
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
