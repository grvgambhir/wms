"use client";

import { useParams } from "next/navigation";
import { OpsSection } from "@/components/tournaments/ops-section";
import type { OpsModule } from "@/lib/types";

const MODULES: OpsModule[] = ["accreditation", "hospitality", "accommodation", "transport", "workforce"];

export default function EventOpsPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="space-y-10">
      <div>
        <h2 className="font-heading text-xl font-semibold text-navy">Event operations</h2>
        <p className="text-sm text-muted-foreground">
          Accreditation, hospitality, hotels, transport and workforce - the delivery plan a competition manager signs off with the host.
        </p>
      </div>
      {MODULES.map((module) => (
        <OpsSection key={module} competitionId={id} module={module} />
      ))}
    </div>
  );
}
