"use client";

import { useParams } from "next/navigation";
import { OpsSection } from "@/components/tournaments/ops-section";

export default function BroadcastPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-10">
      <OpsSection competitionId={id} module="broadcast" />
      <OpsSection competitionId={id} module="media" />
    </div>
  );
}
