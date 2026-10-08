"use client";

import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";

export default function CmsPagesPage() {
  const { state, setPageStatus } = useStore();
  return (
    <div>
      <PageHeader
        eyebrow="CMS"
        title="Pages"
        description="Core site pages. Publishing here would update world.rugby in production."
        back={{ href: "/cms", label: "Back to CMS" }}
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Updated</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {state.pages.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="px-4 py-3 font-medium text-navy">{p.title}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.slug}</td>
                <td className="px-4 py-3">{formatDateTime(p.updatedAt)}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-right">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      const next = p.status === "published" ? "draft" : "published";
                      setPageStatus(p.id, next);
                      toast.success(`${p.title} marked ${next}.`);
                    }}
                  >
                    {p.status === "published" ? "Unpublish" : "Publish"}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
