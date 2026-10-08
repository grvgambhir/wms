"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { formatDateTime } from "@/lib/format";

export default function NewsListPage() {
  const { state } = useStore();
  return (
    <div>
      <PageHeader
        eyebrow="CMS"
        title="News"
        description="Newsroom articles. Publishing updates the HQ dashboard widget."
        back={{ href: "/cms", label: "Back to CMS" }}
        actions={
          <Link
            href="/cms/news/new"
            className="wr-btn inline-flex h-8 items-center rounded-lg px-3 text-sm font-medium"
          >
            New article
          </Link>
        }
      />
      <div className="space-y-2">
        {state.articles.map((a) => (
          <Link
            key={a.id}
            href={`/cms/news/${a.id}`}
            className="flex items-start justify-between gap-4 rounded-xl border bg-card px-4 py-3 hover:shadow-sm"
          >
            <div>
              <p className="font-medium text-navy">{a.title}</p>
              <p className="text-sm text-muted-foreground">{a.excerpt}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {a.author} · {formatDateTime(a.updatedAt)} · {a.tags.join(", ")}
              </p>
            </div>
            <StatusBadge status={a.status} />
          </Link>
        ))}
      </div>
    </div>
  );
}
