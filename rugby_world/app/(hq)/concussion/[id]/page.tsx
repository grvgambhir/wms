"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate, formatDateTime } from "@/lib/format";
import type { HiaOutcome } from "@/lib/types";

const HIA_OPTIONS: Record<string, HiaOutcome[]> = {
  HIA1: ["return", "remove"],
  HIA2: ["confirm", "refer", "clear"],
  HIA3: ["diagnose", "clear"],
};

export default function ConcussionCasePage() {
  const { id } = useParams<{ id: string }>();
  const { state, completeHia, setRtpStage } = useStore();
  const record = state.cases.find((c) => c.id === id);
  const [notes, setNotes] = useState("");

  if (!record) return <p>Case not found.</p>;

  const pending = record.hia.find((h) => h.outcome === "pending");

  return (
    <div>
      <PageHeader
        eyebrow="Confidential · demo"
        title={record.player}
        description={`${record.position} · ${record.unionName} · ${record.matchLabel}`}
        actions={<StatusBadge status={record.diagnosis} />}
        back={{ href: "/concussion", label: "Back to concussion" }}
      />
      <div className="mb-4 rounded-lg border bg-card px-4 py-3 text-sm">
        <p className="font-medium text-navy">
          {record.teamFlag} {record.teamName || record.unionName}
          {record.minute != null ? ` · ${record.minute}'` : ""}
          {record.source === "match" ? " · tagged in match" : record.source === "manual" ? " · manual entry" : ""}
        </p>
        <p className="mt-1 text-muted-foreground">
          {record.matchId ? (
            <Link href={`/tournaments/matches/${record.matchId}`} className="text-navy hover:underline">
              {record.matchLabel}
            </Link>
          ) : (
            record.matchLabel
          )}
          {" · "}
          {formatDateTime(record.occurredAt)}
        </p>
        {record.notes && <p className="mt-2">{record.notes}</p>}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>HIA 1 → 2 → 3</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {record.hia.map((h) => (
              <div key={h.stage} className="rounded-lg border px-3 py-3">
                <div className="flex items-center justify-between">
                  <p className="font-medium text-navy">
                    {h.stage} · {h.label}
                  </p>
                  <StatusBadge status={h.outcome} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Due {formatDateTime(h.due)}
                  {h.completedAt ? ` · completed ${formatDateTime(h.completedAt)}` : ""}
                </p>
                {h.notes && <p className="mt-2 text-sm">{h.notes}</p>}
              </div>
            ))}
            {pending && (
              <div className="rounded-lg border border-navy/20 bg-muted/50 p-3">
                <p className="text-sm font-medium">Complete {pending.stage}</p>
                <Label className="mt-2">Clinical notes</Label>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" rows={3} />
                <div className="mt-3 flex flex-wrap gap-2">
                  {HIA_OPTIONS[pending.stage].map((outcome) => (
                    <Button
                      key={outcome}
                      type="button"
                      variant={outcome === "remove" || outcome === "diagnose" ? "destructive" : "default"}
                      onClick={() => {
                        completeHia(record.id, pending.stage, outcome, notes);
                        setNotes("");
                        toast.success(`${pending.stage} recorded as ${outcome}.`);
                      }}
                    >
                      {outcome}
                    </Button>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Graduated return to play</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {record.rtp.map((stage) => (
              <div key={stage.stage} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
                <div>
                  <p className="text-sm font-medium">
                    Stage {stage.stage} · {stage.name}
                  </p>
                  <p className="text-xs text-muted-foreground">Due {formatDate(stage.due)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <StatusBadge status={stage.status} />
                  {stage.status !== "cleared" && (
                    <>
                      <Button size="sm" onClick={() => { setRtpStage(record.id, stage.stage, "cleared"); toast.success(`Stage ${stage.stage} cleared.`); }}>
                        Clear
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => { setRtpStage(record.id, stage.stage, "hold"); toast.message("Stage held."); }}>
                        Hold
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
