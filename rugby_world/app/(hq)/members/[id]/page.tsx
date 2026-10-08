"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import { PlayerName } from "@/components/players/player-stats";
import { unionStatsFromLearners } from "@/lib/education";
import { FederationHierarchy } from "@/components/members/federation-hierarchy";

export default function UnionProfilePage() {
  const { id } = useParams<{ id: string }>();
  const { state, addUnionNote } = useStore();
  const union = state.unions.find((u) => u.id === id);
  const [note, setNote] = useState("");
  const teams = state.teams.filter((t) => t.unionId === id);
  const relatedCases = state.cases.filter(
    (c) => c.unionId === id || c.unionName === union?.name || c.unionName === union?.country
  );
  const enrolments = unionStatsFromLearners(state.learners, id);
  const license = state.licenses.find((row) => row.unionId === id);

  if (!union) return <p>Union not found.</p>;

  function onNote(e: FormEvent) {
    e.preventDefault();
    if (!note.trim() || !id) return;
    addUnionNote(id, note.trim());
    setNote("");
    toast.success("Note added to union file.");
  }

  return (
    <div>
      <PageHeader
        eyebrow={union.region}
        title={`${union.flag} ${union.name}`}
        description={`${union.hq} · Member since ${union.joined}`}
        actions={<StatusBadge status={union.membership} />}
        back={{ href: "/members", label: "Back to member associations" }}
      />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>Contacts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {union.contacts.map((c) => (
              <div key={c.email}>
                <p className="font-medium">{c.name}</p>
                <p className="text-muted-foreground">{c.role}</p>
                <p className="text-xs">{c.email}</p>
              </div>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Compliance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="mb-1 text-xs">Concussion reporting {union.concussionCompliance}%</p>
              <Progress value={union.concussionCompliance} />
            </div>
            <div>
              <p className="mb-1 text-xs">Education completion {union.educationCompletion}%</p>
              <Progress value={union.educationCompletion} />
            </div>
            <p className="text-xs text-muted-foreground">Competitions: {union.competitions.join(", ")}</p>
            {license ? (
              <p className="text-xs">
                TMS licence{" "}
                <Link href={`/licenses/${license.id}`} className="font-medium text-navy hover:underline">
                  {license.licenseKey}
                </Link>
              </p>
            ) : (
              <p className="text-xs">
                No TMS licence.{" "}
                <Link href="/licenses/new" className="font-medium text-navy hover:underline">
                  Issue one
                </Link>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>HQ notes</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={onNote} className="space-y-2">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} placeholder="Add an operational note" />
              <Button type="submit" size="sm" variant="brand">
                Add note
              </Button>
            </form>
            <ul className="mt-3 space-y-1 text-sm">
              {union.notes.map((n) => (
                <li key={n} className="rounded-md bg-muted px-2 py-1">
                  {n}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
      <div className="mt-4">
        <FederationHierarchy unionId={union.id} />
      </div>
      {teams.length > 0 && (
        <div className="mt-4 space-y-4">
          {teams.map((team) => {
            const players = state.players.filter((p) => p.teamId === team.id).sort((a, b) => a.number - b.number);
            return (
              <Card key={team.id}>
                <CardHeader className="flex flex-row items-start justify-between gap-3">
                  <div>
                    <CardTitle>
                      Team file · {team.flag} {team.name}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Head coach {team.coach} · {players.length} named players
                    </p>
                  </div>
                  <Link
                    href={`/tournaments/teams/${team.id}`}
                    className="text-sm font-medium text-navy hover:underline"
                  >
                    Open team file
                  </Link>
                </CardHeader>
                <CardContent>
                  {players.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No squad named for this union yet.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs uppercase text-muted-foreground">
                          <tr>
                            <th className="pb-2">No.</th>
                            <th className="pb-2">Player</th>
                            <th className="pb-2">Position</th>
                            <th className="pb-2">Club</th>
                            <th className="pb-2 text-right">Caps</th>
                            <th className="pb-2 text-right">Tries</th>
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
                              <td className="text-right tabular-nums">{p.caps}</td>
                              <td className="text-right tabular-nums">{p.tries}</td>
                              <td>
                                <StatusBadge status={p.status} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Linked concussion cases</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {relatedCases.length === 0 && <p className="text-muted-foreground">No open demo cases for this union.</p>}
            {relatedCases.map((c) => (
              <Link key={c.id} href={`/concussion/${c.id}`} className="block rounded-md border px-3 py-2 hover:bg-muted">
                {c.player} · <StatusBadge status={c.rtpOverall} />
              </Link>
            ))}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Education enrolments</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            {enrolments.length === 0 && (
              <p className="text-muted-foreground">
                No people enrolled from this union. See{" "}
                <Link href="/education" className="text-navy underline">
                  Courses
                </Link>
                .
              </p>
            )}
            {enrolments.map((e) => {
              const course = state.courses.find((c) => c.id === e.courseId);
              const pct = Math.round((e.completed / e.enrolled) * 100);
              return (
                <div key={e.id}>
                  <p>
                    {course?.title} · {e.completed}/{e.enrolled} passed · {pct}%
                  </p>
                  <Progress value={pct} />
                </div>
              );
            })}
            {state.learners.filter((row) => row.unionId === id).length > 0 && (
              <div className="mt-4 border-t pt-3">
                <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">Named people</p>
                <div className="space-y-2">
                  {state.learners
                    .filter((row) => row.unionId === id)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map((row) => {
                      const course = state.courses.find((c) => c.id === row.courseId);
                      return (
                        <div key={row.id} className="flex items-start justify-between gap-2 rounded-md border px-3 py-2">
                          <div>
                            <p className="font-medium text-navy">
                              <Link href={`/education/${row.courseId}/learners/${row.id}`} className="hover:underline">
                                {row.name}
                              </Link>
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {row.role ?? "Staff"} · {course?.title}
                            </p>
                          </div>
                          {row.certificateId ? (
                            <Link href={`/education/certificates/${row.certificateId}`} className="text-xs font-medium text-navy hover:underline">
                              Cert issued
                            </Link>
                          ) : (
                            <StatusBadge status={row.status} />
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
