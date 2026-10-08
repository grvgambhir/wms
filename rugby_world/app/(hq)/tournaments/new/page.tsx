"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CompetitionStatus, RugbyFormat } from "@/lib/types";
import { structureChoices, normalizeStructure } from "@/lib/tournament-hub";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export default function NewTournamentPage() {
  const router = useRouter();
  const { createCompetition } = useStore();
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [season, setSeason] = useState("2026");
  const [location, setLocation] = useState("");
  const [hostCountry, setHostCountry] = useState("");
  const [hostUnion, setHostUnion] = useState("");
  const [organiser, setOrganiser] = useState("World Rugby");
  const [hostCities, setHostCities] = useState("");
  const [structure, setStructure] = useState("");
  const [lawNotes, setLawNotes] = useState("");
  const [broadcaster, setBroadcaster] = useState("");
  const [startDate, setStartDate] = useState("2026-10-01");
  const [endDate, setEndDate] = useState("2026-11-15");
  const [status, setStatus] = useState<CompetitionStatus>("upcoming");
  const [format, setFormat] = useState<RugbyFormat>("15s");
  const [description, setDescription] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = createCompetition({
      name,
      shortName,
      season,
      location: location || hostCountry,
      startDate,
      endDate,
      status,
      format,
      description,
      hostCountry: hostCountry || location,
      hostUnion: hostUnion || "World Rugby",
      organiser,
      hostCities: hostCities || location || hostCountry,
      structure,
      lawNotes,
      broadcaster: broadcaster || "TBC",
    });
    toast.success("Tournament created. Add teams to start the competition.");
    router.push(`/tournaments/${id}/roster`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Tournament Management"
        title="Create tournament"
        description="Register the competition, format and host. You then add teams, create groups, auto-build fixtures, then the bracket, then appoint officials."
        back={{ href: "/tournaments", label: "Back to tournaments" }}
      />
      <form onSubmit={onSubmit} className="w-full space-y-6">
        <section className="space-y-4 rounded-xl border bg-card p-5 lg:p-6">
          <h2 className="font-heading text-lg font-semibold text-navy">Competition</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div className="sm:col-span-2 xl:col-span-3">
              <Label htmlFor="name">Official name</Label>
              <Input id="name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Pacific Nations Cup 2027" />
            </div>
            <div>
              <Label htmlFor="short">Short name</Label>
              <Input id="short" required value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="PNC 2027" />
            </div>
            <div>
              <Label htmlFor="season">Season</Label>
              <Input id="season" required value={season} onChange={(e) => setSeason(e.target.value)} />
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
              <Label htmlFor="start">Start date</Label>
              <Input id="start" type="date" required value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="end">End date</Label>
              <Input id="end" type="date" required value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            <div className="sm:col-span-2 xl:col-span-3">
              <Label htmlFor="desc">Description</Label>
              <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-5 lg:p-6">
          <h2 className="font-heading text-lg font-semibold text-navy">Format</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="format">Code</Label>
              <select id="format" className={field} value={format} onChange={(e) => setFormat(e.target.value as RugbyFormat)}>
                <option value="15s">15s</option>
                <option value="7s">Sevens</option>
                <option value="u20">Under-20</option>
              </select>
            </div>
            <div>
              <Label htmlFor="structure">Structure</Label>
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
            <div className="sm:col-span-2 xl:col-span-3">
              <Label htmlFor="laws">Laws and regulations</Label>
              <Textarea id="laws" rows={3} value={lawNotes} onChange={(e) => setLawNotes(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="space-y-4 rounded-xl border bg-card p-5 lg:p-6">
          <h2 className="font-heading text-lg font-semibold text-navy">Host country</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            <div>
              <Label htmlFor="country">Host country</Label>
              <Input id="country" required value={hostCountry} onChange={(e) => setHostCountry(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="location">Location label</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Same as host, or a circuit" />
            </div>
            <div>
              <Label htmlFor="union">Host union</Label>
              <Input id="union" value={hostUnion} onChange={(e) => setHostUnion(e.target.value)} placeholder="Rugby Australia" />
            </div>
            <div>
              <Label htmlFor="organiser">Organiser</Label>
              <Input id="organiser" value={organiser} onChange={(e) => setOrganiser(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="broadcaster">Broadcaster</Label>
              <Input id="broadcaster" value={broadcaster} onChange={(e) => setBroadcaster(e.target.value)} placeholder="Stan Sport / Nine" />
            </div>
            <div>
              <Label htmlFor="cities">Host cities</Label>
              <Input id="cities" value={hostCities} onChange={(e) => setHostCities(e.target.value)} placeholder="Sydney, Brisbane, Melbourne" />
            </div>
          </div>
        </section>

        <Button type="submit" variant="brand">
          Create tournament
        </Button>
      </form>
    </div>
  );
}
