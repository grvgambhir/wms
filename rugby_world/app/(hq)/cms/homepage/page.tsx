"use client";

import { toast } from "sonner";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";

export default function HomepageBlocksPage() {
  const { state, moveHomepageBlock, toggleHomepageBlock } = useStore();
  return (
    <div>
      <PageHeader
        eyebrow="CMS"
        title="Homepage blocks"
        description="Order and enable modules that would appear on world.rugby."
        back={{ href: "/cms", label: "Back to CMS" }}
      />
      <div className="space-y-2">
        {state.homepageBlocks.map((block, index) => (
          <div key={block.id} className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3">
            <span className="w-6 text-xs text-muted-foreground">{index + 1}</span>
            <div className="flex-1">
              <p className="font-medium text-navy">{block.title}</p>
              <p className="text-xs text-muted-foreground">{block.detail}</p>
            </div>
            <StatusBadge status={block.enabled ? "published" : "draft"} />
            <Button size="sm" variant="outline" onClick={() => toggleHomepageBlock(block.id)}>
              {block.enabled ? "Disable" : "Enable"}
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={index === 0}
              onClick={() => {
                moveHomepageBlock(block.id, "up");
                toast.message("Block moved up.");
              }}
            >
              <ArrowUp />
            </Button>
            <Button
              size="icon-sm"
              variant="ghost"
              disabled={index === state.homepageBlocks.length - 1}
              onClick={() => {
                moveHomepageBlock(block.id, "down");
                toast.message("Block moved down.");
              }}
            >
              <ArrowDown />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
