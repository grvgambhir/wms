"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { KpiCard, PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const LINKS = [
  { href: "/cms/pages", title: "Pages", body: "Static site pages, draft and publish." },
  { href: "/cms/news", title: "News", body: "Articles for world.rugby newsroom." },
  { href: "/cms/media", title: "Media library", body: "Images, video and documents." },
  { href: "/cms/homepage", title: "Homepage blocks", body: "Order and toggle homepage modules." },
];

export default function CmsHomePage() {
  const { state } = useStore();
  const drafts = state.articles.filter((a) => a.status === "draft").length;
  return (
    <div>
      <PageHeader
        eyebrow="Module 03"
        title="Website Admin / CMS"
        description="Operate world.rugby content from HQ. This prototype stays inside the admin app - there is no public site preview."
      />
      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <KpiCard label="Pages" value={state.pages.length} href="/cms/pages" />
        <KpiCard label="Articles" value={state.articles.length} href="/cms/news" />
        <KpiCard label="Drafts" value={drafts} href="/cms/news" />
        <KpiCard label="Media assets" value={state.media.length} href="/cms/media" />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            <Card className="h-full hover:shadow-md">
              <CardHeader>
                <CardTitle>{l.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{l.body}</p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      <Card className="mt-4">
        <CardHeader>
          <CardTitle>Latest articles</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {state.articles.map((a) => (
            <Link key={a.id} href={`/cms/news/${a.id}`} className="flex items-center justify-between rounded-lg border px-3 py-2 hover:bg-muted/60">
              <span className="text-sm font-medium text-navy">{a.title}</span>
              <StatusBadge status={a.status} />
            </Link>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
