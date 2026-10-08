"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export default function HostCountryPage() {
  const { id } = useParams<{ id: string }>();
  const { state, updateCompetition } = useStore();
  const competition = state.competitions.find((c) => c.id === id);
  const [hostCountry, setHostCountry] = useState(competition?.hostCountry ?? "");
  const [hostUnion, setHostUnion] = useState(competition?.hostUnion ?? "");
  const [organiser, setOrganiser] = useState(competition?.organiser ?? "");
  const [hostCities, setHostCities] = useState(competition?.hostCities ?? "");
  const [location, setLocation] = useState(competition?.location ?? "");

  if (!competition) return null;

  function onSave(e: FormEvent) {
    e.preventDefault();
    updateCompetition(id, { hostCountry, hostUnion, organiser, hostCities, location });
    toast.success("Host details saved.");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold text-navy">Host country</h2>
        <p className="text-sm text-muted-foreground">
          Host union, organising body and cities delivering this tournament.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Host delivery</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="grid gap-4 sm:grid-cols-2">
            <div>
              <Label htmlFor="country">Host country</Label>
              <Input id="country" className={field} value={hostCountry} onChange={(e) => setHostCountry(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="union">Host union</Label>
              <Input id="union" value={hostUnion} onChange={(e) => setHostUnion(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="organiser">Organiser</Label>
              <Input id="organiser" value={organiser} onChange={(e) => setOrganiser(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="cities">Host cities</Label>
              <Input id="cities" value={hostCities} onChange={(e) => setHostCities(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="location">Location label</Label>
              <Input id="location" value={location} onChange={(e) => setLocation(e.target.value)} />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" className="bg-navy">
                Save host country
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
