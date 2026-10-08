"use client";

import { useParams } from "next/navigation";
import { OpsSection } from "@/components/tournaments/ops-section";
import type { OpsModule } from "@/lib/types";

export function TournamentOpsPage({ module }: { module: OpsModule }) {
  const { id } = useParams<{ id: string }>();
  return <OpsSection competitionId={id} module={module} />;
}
