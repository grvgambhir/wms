"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPS_FIELD_COPY } from "@/lib/tournament-hub";
import type { OpsModule, OpsStatus } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export function OpsSection({ competitionId, module }: { competitionId: string; module: OpsModule }) {
  const { state, createOpsItem, updateOpsItem } = useStore();
  const copy = OPS_FIELD_COPY[module];
  const rows = state.tournamentOps.filter(
    (item) => item.competitionId === competitionId && item.module === module
  );
  const [title, setTitle] = useState("");
  const [meta, setMeta] = useState("");
  const [owner, setOwner] = useState("HQ Competitions");
  const [status, setStatus] = useState<OpsStatus>("planned");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Add a title.");
      return;
    }
    createOpsItem({
      competitionId,
      module,
      title: title.trim(),
      meta: meta.trim(),
      owner: owner.trim() || "HQ Competitions",
      status,
    });
    setTitle("");
    setMeta("");
    toast.success(`${copy.title} record added.`);
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-heading text-xl font-semibold text-navy">{copy.title}</h2>
        <p className="text-sm text-muted-foreground">{copy.description}</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Add record</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor={`${module}-title`}>{copy.titleLabel}</Label>
              <Input id={`${module}-title`} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${module}-meta`}>{copy.metaLabel}</Label>
              <Input id={`${module}-meta`} value={meta} onChange={(e) => setMeta(e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${module}-owner`}>Owner</Label>
              <Input id={`${module}-owner`} value={owner} onChange={(e) => setOwner(e.target.value)} />
            </div>
            <div>
              <Label htmlFor={`${module}-status`}>Status</Label>
              <select
                id={`${module}-status`}
                className={field}
                value={status}
                onChange={(e) => setStatus(e.target.value as OpsStatus)}
              >
                <option value="planned">Planned</option>
                <option value="assigned">Assigned</option>
                <option value="in-progress">In progress</option>
                <option value="complete">Complete</option>
                <option value="at-risk">At risk</option>
              </select>
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="brand">
                Add to {copy.title.toLowerCase()}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-2">
        {rows.length === 0 && (
          <p className="text-sm text-muted-foreground">Nothing recorded yet. Add the first item above.</p>
        )}
        {rows.map((row) => (
          <div key={row.id} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-card px-4 py-3">
            <div>
              <p className="font-medium text-navy">{row.title}</p>
              <p className="text-sm text-muted-foreground">{row.meta}</p>
              <p className="mt-1 text-xs text-muted-foreground">{row.owner}</p>
            </div>
            <select
              className="h-8 rounded-full border border-input bg-white px-2 text-[11px] font-semibold uppercase"
              value={row.status}
              onChange={(e) => updateOpsItem({ ...row, status: e.target.value as OpsStatus })}
              aria-label={`Status for ${row.title}`}
            >
              <option value="planned">Planned</option>
              <option value="assigned">Assigned</option>
              <option value="in-progress">In progress</option>
              <option value="complete">Complete</option>
              <option value="at-risk">At risk</option>
            </select>
          </div>
        ))}
      </div>
    </div>
  );
}
