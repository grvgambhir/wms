"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { structureNeedsRoundRobin, venuesForCompetition } from "@/lib/tournament-hub";
import { GroupStandingsTable } from "@/components/tournaments/group-table";
import { JourneyNext, useSetupJourney } from "@/components/tournaments/setup-journey";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export default function TournamentGroupsPage() {
  const { id } = useParams<{ id: string }>();
  const { state, createGroup, assignTeamToGroup, generateRoundRobinSchedule } = useStore();
  const { steps } = useSetupJourney(id);
  const competition = state.competitions.find((c) => c.id === id);
  const squads = state.teams.filter((t) => t.competitionIds.includes(id));
  const groups = competition?.pools ?? [];
  const assignedNames = new Set(groups.flatMap((g) => g.standings.map((s) => s.team)));
  const unassigned = squads.filter((t) => !assignedNames.has(t.name));
  const venues = competition ? venuesForCompetition(state.venues, competition) : [];
  const [groupName, setGroupName] = useState("");
  const [pick, setPick] = useState<Record<string, string>>({});

  const canSchedule = useMemo(
    () => groups.some((g) => g.standings.length >= 2) || (groups.length === 0 && squads.length >= 2),
    [groups, squads.length]
  );

  if (!competition) return null;

  function onCreateGroup(e: FormEvent) {
    e.preventDefault();
    if (!groupName.trim()) {
      toast.error("Enter a group name.");
      return;
    }
    if (!createGroup(id, groupName)) {
      toast.error("Use a unique group name.");
      return;
    }
    setGroupName("");
    toast.success("Group created.");
  }

  function onAssign(poolName: string) {
    const teamId = pick[poolName];
    if (!teamId) return;
    assignTeamToGroup(id, teamId, poolName);
    setPick((prev) => ({ ...prev, [poolName]: "" }));
    toast.success("Team added to group.");
  }

  function onSchedule() {
    if (!canSchedule) {
      toast.error("Add at least two teams to a group first.");
      return;
    }
    if (venues.length === 0 && state.venues.length === 0) {
      toast.error("Add a venue before building the schedule.");
      return;
    }
    const created = generateRoundRobinSchedule(id);
    if (!created) {
      toast.message("All round-robin fixtures for these groups already exist.");
      return;
    }
    toast.success(`${created} round-robin fixtures added. Open Fixtures for the grid, then build the knockout bracket.`);
  }

  const wantsRoundRobin = structureNeedsRoundRobin(competition.structure);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-navy">Groups</h2>
          <p className="text-sm text-muted-foreground">
            {squads.length === 0
              ? "Add teams on the roster first, then create pools and place them."
              : "Create pools or a single round-robin group, place teams, then auto-build the fixture list."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {squads.length === 0 && (
            <Link
              href={`/tournaments/${id}/roster`}
              className="wr-btn inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium"
            >
              Add teams first
            </Link>
          )}
          {wantsRoundRobin && (
            <Button type="button" variant="brand" onClick={onSchedule} disabled={!canSchedule}>
              Create round-robin schedule
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={onCreateGroup} className="mb-6 flex flex-wrap items-end gap-2">
        <div>
          <Label htmlFor="group">New group</Label>
          <Input
            id="group"
            value={groupName}
            onChange={(e) => setGroupName(e.target.value)}
            placeholder="Pool A"
          />
        </div>
        <Button type="submit" variant="brand">
          Create group
        </Button>
      </form>

      {groups.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No groups yet. Create Pool A / Pool B, or one “Round robin” group, then add teams.
        </p>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          {groups.map((group) => (
            <section key={group.name} className="min-w-0">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="font-heading text-lg font-semibold text-navy">{group.name}</h3>
                <p className="text-xs text-muted-foreground">{group.standings.length} teams</p>
              </div>
              <GroupStandingsTable pool={group} />
              {unassigned.length > 0 && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <select
                    className={field + " max-w-xs"}
                    value={pick[group.name] ?? ""}
                    onChange={(e) => setPick((prev) => ({ ...prev, [group.name]: e.target.value }))}
                  >
                    <option value="">Add team…</option>
                    {unassigned.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.flag} {t.name}
                      </option>
                    ))}
                  </select>
                  <Button type="button" size="sm" variant="outline" onClick={() => onAssign(group.name)}>
                    Add to {group.name}
                  </Button>
                </div>
              )}
            </section>
          ))}
        </div>
      )}
      <JourneyNext steps={steps} on="groups" />
    </div>
  );
}
