"use client";

import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function VenuesPage() {
  const { state } = useStore();
  return (
    <div>
      <PageHeader
        eyebrow="Tournament Management"
        title="Venues register"
        description="Match venues attached to World Rugby competitions."
        back={{ href: "/tournaments", label: "Back to tournaments" }}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {state.venues.map((v) => (
          <Card key={v.id}>
            <CardContent>
              <h2 className="font-heading text-lg font-semibold text-navy">{v.name}</h2>
              <p className="text-sm text-muted-foreground">
                {v.city}, {v.country}
              </p>
              <p className="mt-2 text-xs">Capacity {v.capacity.toLocaleString()}</p>
              <p className="mt-1 text-xs text-muted-foreground">{v.competitions.join(" · ")}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
