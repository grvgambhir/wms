"use client";

import { FormEvent, useMemo, useState } from "react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { treeForUnion } from "@/lib/licenses";
import { FederationHierarchy } from "@/components/members/federation-hierarchy";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { FederationNodeKind } from "@/lib/types";

export function FederationTree({ unionId }: { unionId: string }) {
  const { state, addFederationNode } = useStore();
  const { list } = useMemo(
    () => treeForUnion(state.federationNodes, unionId),
    [state.federationNodes, unionId]
  );
  const regions = list.filter((row) => row.kind === "region");
  const [kind, setKind] = useState<FederationNodeKind>("club");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [parentId, setParentId] = useState<string>("");

  function onAdd(e: FormEvent) {
    e.preventDefault();
    const id = addFederationNode({
      unionId,
      parentId: kind === "region" ? null : parentId || null,
      kind,
      name,
      city,
    });
    if (!id) {
      toast.error("Name is required.");
      return;
    }
    toast.success(`${name.trim()} added to the federation.`);
    setName("");
    setCity("");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,0.75fr)]">
      <FederationHierarchy unionId={unionId} />
      <form onSubmit={onAdd} className="h-fit space-y-3 rounded-xl border bg-card p-4">
        <h2 className="font-heading text-lg font-semibold text-navy">Add to the tree</h2>
        <div>
          <Label>Type</Label>
          <select
            className="h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm"
            value={kind}
            onChange={(e) => setKind(e.target.value as FederationNodeKind)}
          >
            <option value="region">Region / province</option>
            <option value="club">Club</option>
          </select>
        </div>
        {kind === "club" && regions.length > 0 && (
          <div>
            <Label>Parent region</Label>
            <select
              className="h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm"
              value={parentId}
              onChange={(e) => setParentId(e.target.value)}
            >
              <option value="">Directly under the union</option>
              {regions.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <Label htmlFor="fn-name">Name</Label>
          <Input id="fn-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Ponsonby RFC" />
        </div>
        <div>
          <Label htmlFor="fn-city">City</Label>
          <Input id="fn-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Auckland" />
        </div>
        <Button type="submit" variant="brand">
          Add
        </Button>
      </form>
    </div>
  );
}
