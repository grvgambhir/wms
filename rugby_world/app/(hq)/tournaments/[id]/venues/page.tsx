"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { venuesForCompetition } from "@/lib/tournament-hub";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export default function TournamentVenuesPage() {
  const { id } = useParams<{ id: string }>();
  const { state, createVenue, attachVenueToCompetition } = useStore();
  const competition = state.competitions.find((c) => c.id === id);
  const attached = competition ? venuesForCompetition(state.venues, competition) : [];
  const available = state.venues.filter((v) => !attached.some((a) => a.id === v.id));
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [country, setCountry] = useState(competition?.hostCountry ?? "");
  const [capacity, setCapacity] = useState("25000");
  const [venueId, setVenueId] = useState(available[0]?.id ?? "");
  const [showAdd, setShowAdd] = useState(false);

  if (!competition) return null;
  const current = competition;

  function onCreate(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Stadium name is required.");
      return;
    }
    createVenue({
      name: name.trim(),
      city: city.trim() || current.hostCities.split(",")[0]?.trim() || current.hostCountry,
      country: country.trim() || current.hostCountry,
      capacity: Number(capacity) || 0,
      competitionId: current.id,
      shortName: current.shortName,
    });
    setName("");
    setCity("");
    toast.success("Venue added to this tournament.");
  }

  function onAttach(e: FormEvent) {
    e.preventDefault();
    if (!venueId) return;
    attachVenueToCompetition(venueId, current.shortName);
    toast.success("Venue attached.");
  }

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-heading text-xl font-semibold text-navy">Venues</h2>
          <p className="text-sm text-muted-foreground">Match stadiums for scheduling, medical cover and broadcast compounds.</p>
        </div>
        <Button type="button" size="sm" variant="brand" onClick={() => setShowAdd((v) => !v)}>
          {showAdd ? "Hide" : "Add venue"}
        </Button>
      </div>
      {showAdd && (
        <div className="mb-4 space-y-3 rounded-lg border bg-muted/40 p-4">
          <form onSubmit={onCreate} className="grid gap-3 sm:grid-cols-4">
            <div>
              <Label htmlFor="vname">Name</Label>
              <Input id="vname" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="vcity">City</Label>
              <Input id="vcity" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="vcountry">Country</Label>
              <Input id="vcountry" value={country} onChange={(e) => setCountry(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="vcap">Capacity</Label>
              <Input id="vcap" type="number" value={capacity} onChange={(e) => setCapacity(e.target.value)} />
            </div>
            <div className="sm:col-span-4">
              <Button type="submit" variant="brand">
                Save stadium
              </Button>
            </div>
          </form>
          {available.length > 0 && (
            <form onSubmit={onAttach} className="flex flex-wrap items-end gap-2 border-t pt-3">
              <select className={field} value={venueId} onChange={(e) => setVenueId(e.target.value)}>
                {available.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.city}
                  </option>
                ))}
              </select>
              <Button type="submit" variant="outline">
                Attach from register
              </Button>
            </form>
          )}
        </div>
      )}
      {attached.length === 0 ? (
        <p className="text-sm text-muted-foreground">No venues on this tournament yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="pb-2">Stadium</th>
              <th className="pb-2">City</th>
              <th className="pb-2">Country</th>
              <th className="pb-2">Capacity</th>
            </tr>
          </thead>
          <tbody>
            {attached.map((v) => (
              <tr key={v.id} className="border-t">
                <td className="py-2 font-medium text-navy">{v.name}</td>
                <td>{v.city}</td>
                <td>{v.country}</td>
                <td className="tabular-nums">{v.capacity.toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
