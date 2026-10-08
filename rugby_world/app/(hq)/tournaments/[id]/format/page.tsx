"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { RugbyFormat } from "@/lib/types";
import { structureChoices, normalizeStructure } from "@/lib/tournament-hub";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export default function FormatPage() {
  const { id } = useParams<{ id: string }>();
  const { state, updateCompetition } = useStore();
  const competition = state.competitions.find((c) => c.id === id);
  const [format, setFormat] = useState<RugbyFormat>(competition?.format ?? "15s");
  const [structure, setStructure] = useState(competition?.structure ?? "");
  const [lawNotes, setLawNotes] = useState(competition?.lawNotes ?? "");

  if (!competition) return null;

  function onSave(e: FormEvent) {
    e.preventDefault();
    updateCompetition(id, { format, structure, lawNotes });
    toast.success("Format saved.");
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold text-navy">Format</h2>
        <p className="text-sm text-muted-foreground">
          Playing format, tournament structure and law variations for this competition.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Playing format</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSave} className="grid gap-4">
            <div>
              <Label htmlFor="format">Code</Label>
              <select
                id="format"
                className={field}
                value={format}
                onChange={(e) => setFormat(e.target.value as RugbyFormat)}
              >
                <option value="15s">15s</option>
                <option value="7s">Sevens</option>
                <option value="u20">Under-20</option>
              </select>
            </div>
            <div>
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
            <div>
              <Label htmlFor="laws">Laws and regulations</Label>
              <Textarea
                id="laws"
                rows={5}
                value={lawNotes}
                onChange={(e) => setLawNotes(e.target.value)}
                placeholder="TMO protocol, squad size, bunker, HIA notes"
              />
            </div>
            <Button type="submit" className="w-fit bg-navy">
              Save format
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
