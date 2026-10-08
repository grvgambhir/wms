"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompetitionStatus, RugbyFormat } from "@/lib/types";
import { GroupStandingsTable } from "@/components/tournaments/group-table";
import { structureChoices, normalizeStructure } from "@/lib/tournament-hub";
import { JourneyNext, useSetupJourney } from "@/components/tournaments/setup-journey";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export default function CompetitionOverviewPage() {
  const { id } = useParams<{ id: string }>();
  const { state, updateCompetition } = useStore();
  const competition = state.competitions.find((c) => c.id === id);
  const { steps } = useSetupJourney(id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(competition?.name ?? "");
  const [shortName, setShortName] = useState(competition?.shortName ?? "");
  const [season, setSeason] = useState(competition?.season ?? "");
  const [startDate, setStartDate] = useState(competition?.startDate ?? "");
  const [endDate, setEndDate] = useState(competition?.endDate ?? "");
  const [hostCountry, setHostCountry] = useState(competition?.hostCountry ?? "");
  const [hostUnion, setHostUnion] = useState(competition?.hostUnion ?? "");
  const [hostCities, setHostCities] = useState(competition?.hostCities ?? "");
  const [broadcaster, setBroadcaster] = useState(competition?.broadcaster ?? "");
  const [organiser, setOrganiser] = useState(competition?.organiser ?? "");
  const [format, setFormat] = useState<RugbyFormat>(competition?.format ?? "15s");
  const [structure, setStructure] = useState(competition?.structure ?? "");
  const [status, setStatus] = useState<CompetitionStatus>(competition?.status ?? "upcoming");
  const [description, setDescription] = useState(competition?.description ?? "");
  const [lawNotes, setLawNotes] = useState(competition?.lawNotes ?? "");

  if (!competition) return null;

  function onSave(e: FormEvent) {
    e.preventDefault();
    updateCompetition(id, {
      name,
      shortName,
      season,
      startDate,
      endDate,
      hostCountry,
      hostUnion,
      hostCities,
      broadcaster,
      organiser,
      format,
      structure,
      status,
      description,
      lawNotes,
      location: hostCountry,
    });
    setEditing(false);
    toast.success("Event record saved.");
  }

  return (
    <div className="space-y-8">
      {(!competition.pools || competition.pools.length === 0) && (
        <section className="rounded-lg border border-dashed px-4 py-5">
          <h2 className="font-heading text-xl font-semibold text-navy">Start the competition</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Add teams on the roster, create groups, auto-build round-robin fixtures, then the knockout bracket, then appoint officials.
          </p>
          <Link href={`/tournaments/${id}/roster`} className="mt-2 inline-block text-sm font-medium text-navy hover:underline">
            Start with the roster
          </Link>
        </section>
      )}
      {competition.pools && competition.pools.length > 0 && (
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <h2 className="font-heading text-xl font-semibold text-navy">Groups</h2>
            <Link href={`/tournaments/${id}/groups`} className="text-sm font-medium text-navy hover:underline">
              Manage groups
            </Link>
          </div>
          <div className="grid gap-6 xl:grid-cols-2">
            {competition.pools.map((pool) => (
              <section key={pool.name} className="min-w-0">
                <h3 className="mb-2 font-heading text-lg font-semibold text-navy">{pool.name}</h3>
                <GroupStandingsTable pool={pool} />
              </section>
            ))}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="font-heading text-xl font-semibold text-navy">Laws & regulations</h2>
            <p className="text-sm text-muted-foreground">What the competition manager signs off before kick-off.</p>
          </div>
          <Button type="button" size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
            {editing ? "Close" : "Edit event"}
          </Button>
        </div>
        {!editing ? (
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {competition.lawNotes || "No law notes recorded yet."}
          </p>
        ) : (
          <form onSubmit={onSave} className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="name">Event name</Label>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="short">Short name</Label>
              <Input id="short" value={shortName} onChange={(e) => setShortName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="season">Season</Label>
              <Input id="season" value={season} onChange={(e) => setSeason(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="status">Status</Label>
              <select id="status" className={field} value={status} onChange={(e) => setStatus(e.target.value as CompetitionStatus)}>
                <option value="upcoming">Upcoming</option>
                <option value="live">Live</option>
                <option value="completed">Completed</option>
              </select>
            </div>
            <div>
              <Label htmlFor="format">Format</Label>
              <select id="format" className={field} value={format} onChange={(e) => setFormat(e.target.value as RugbyFormat)}>
                <option value="15s">15s</option>
                <option value="7s">Sevens</option>
                <option value="u20">Under-20</option>
              </select>
            </div>
            <div>
              <Label htmlFor="hostCountry">Host country</Label>
              <Input id="hostCountry" value={hostCountry} onChange={(e) => setHostCountry(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="hostUnion">Host union</Label>
              <Input id="hostUnion" value={hostUnion} onChange={(e) => setHostUnion(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="hostCities">Host cities</Label>
              <Input id="hostCities" value={hostCities} onChange={(e) => setHostCities(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="broadcaster">Broadcaster</Label>
              <Input id="broadcaster" value={broadcaster} onChange={(e) => setBroadcaster(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="organiser">Organiser</Label>
              <Input id="organiser" value={organiser} onChange={(e) => setOrganiser(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="start">Start</Label>
              <Input id="start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">End</Label>
              <Input id="end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="structure">Competition structure</Label>
              <select
                id="structure"
                className={field}
                value={normalizeStructure(structure) || structure}
                onChange={(e) => setStructure(e.target.value)}
              >
                <option value="">Select structure</option>
                {structureChoices(structure).map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="laws">Laws & regulations</Label>
              <Textarea id="laws" rows={4} value={lawNotes} onChange={(e) => setLawNotes(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="bg-navy">
                Save event
              </Button>
            </div>
          </form>
        )}
      </section>
      <JourneyNext steps={steps} />
    </div>
  );
}
