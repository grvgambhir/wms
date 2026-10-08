"use client";

import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { FileText, ImageIcon, Video } from "lucide-react";

const ICONS = {
  image: ImageIcon,
  video: Video,
  document: FileText,
};

export default function MediaLibraryPage() {
  const { state } = useStore();
  return (
    <div>
      <PageHeader
        eyebrow="CMS"
        title="Media library"
        description="Mocked assets. Uploads are disabled in this prototype."
        back={{ href: "/cms", label: "Back to CMS" }}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {state.media.map((m) => {
          const Icon = ICONS[m.type];
          return (
            <Card key={m.id}>
              <CardContent className="flex gap-3">
                <div className="flex size-12 items-center justify-center rounded-lg bg-muted">
                  <Icon className="size-5 text-navy" />
                </div>
                <div>
                  <p className="font-medium text-navy">{m.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {m.type} · {m.size} · {formatDate(m.uploadedAt)}
                  </p>
                  <p className="text-xs">Used on {m.usedOn}</p>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
