"use client";

import { FormEvent, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Article } from "@/lib/types";
import { DEMO_USER } from "@/lib/seed";

export default function ArticleEditorPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { state, saveArticle, publishArticle } = useStore();
  const existing = state.articles.find((a) => a.id === id);

  const initial: Article = useMemo(
    () =>
      existing ?? {
        id,
        title: "",
        excerpt: "",
        body: "",
        hero: "News",
        tags: ["HQ"],
        status: "draft",
        author: DEMO_USER.name,
        updatedAt: new Date().toISOString(),
        publishedAt: null,
      },
    [existing, id]
  );

  const [title, setTitle] = useState(initial.title);
  const [excerpt, setExcerpt] = useState(initial.excerpt);
  const [body, setBody] = useState(initial.body);
  const [tags, setTags] = useState(initial.tags.join(", "));
  const [hero, setHero] = useState(initial.hero);

  function persist(publish = false) {
    const article: Article = {
      ...initial,
      title,
      excerpt,
      body,
      hero,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      status: publish ? "published" : initial.status,
      publishedAt: publish ? new Date().toISOString() : initial.publishedAt,
    };
    saveArticle(article);
    if (publish) publishArticle(article.id);
  }

  function onSave(e: FormEvent) {
    e.preventDefault();
    persist(false);
    toast.success("Article saved.");
    if (id === "new") router.replace(`/cms/news/${initial.id}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="News editor"
        title={title || "Untitled article"}
        actions={existing ? <StatusBadge status={existing.status} /> : <StatusBadge status="draft" />}
        back={{ href: "/cms/news", label: "Back to news" }}
      />
      <form onSubmit={onSave} className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-3 lg:col-span-2">
          <div>
            <Label htmlFor="title">Title</Label>
            <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} required />
          </div>
          <div>
            <Label htmlFor="excerpt">Excerpt</Label>
            <Textarea id="excerpt" value={excerpt} onChange={(e) => setExcerpt(e.target.value)} rows={3} />
          </div>
          <div>
            <Label htmlFor="body">Body</Label>
            <Textarea id="body" value={body} onChange={(e) => setBody(e.target.value)} rows={14} />
          </div>
        </div>
        <div className="space-y-3">
          <div>
            <Label htmlFor="hero">Hero label</Label>
            <Input id="hero" value={hero} onChange={(e) => setHero(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="tags">Tags</Label>
            <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
          </div>
          <Button type="submit" variant="outline" className="w-full">
            Save draft
          </Button>
          <Button
            type="button"
            className="w-full bg-navy"
            onClick={() => {
              persist(true);
              toast.success("Article published. Dashboard widget will include it.");
            }}
          >
            Publish
          </Button>
        </div>
      </form>
    </div>
  );
}
