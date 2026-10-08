"use client";

import { FormEvent, useState, type ChangeEvent } from "react";
import { toast } from "sonner";
import { ExternalLink, FileText, Link2, Video } from "lucide-react";
import { useStore } from "@/lib/store";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatFileSize, youtubeId } from "@/lib/education";
import type { CourseMaterialKind } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export function CourseMaterialsPanel({ courseId }: { courseId: string }) {
  const { state, addCourseMaterial } = useStore();
  const materials = state.courseMaterials.filter((m) => m.courseId === courseId);
  const [kind, setKind] = useState<CourseMaterialKind>("video");
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [sizeLabel, setSizeLabel] = useState("");
  const [notes, setNotes] = useState("");

  function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setSizeLabel(formatFileSize(file.size));
    if (!title) setTitle(file.name.replace(/\.[^.]+$/, ""));
    if (file.type.startsWith("video/")) setKind("video");
    else setKind("document");
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Add a title for this material.");
      return;
    }
    if (!url.trim() && !fileName) {
      toast.error("Paste a link or upload a file.");
      return;
    }
    addCourseMaterial({
      courseId,
      kind,
      title: title.trim(),
      url: url.trim(),
      fileName: fileName || undefined,
      sizeLabel: sizeLabel || undefined,
      notes: notes.trim() || undefined,
    });
    setTitle("");
    setUrl("");
    setFileName("");
    setSizeLabel("");
    setNotes("");
    toast.success("Study material added.");
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Add lesson</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label htmlFor="kind">Type</Label>
              <select id="kind" className={field} value={kind} onChange={(e) => setKind(e.target.value as CourseMaterialKind)}>
                <option value="video">Video</option>
                <option value="link">Link</option>
                <option value="document">Study file</option>
              </select>
            </div>
            <div>
              <Label htmlFor="mat-title">Title</Label>
              <Input id="mat-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="HIA process film" />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mat-url">Video or resource URL</Label>
              <Input
                id="mat-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=… or world.rugby page"
              />
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mat-file">Upload file (video, PDF, slides)</Label>
              <Input id="mat-file" type="file" accept="video/*,.pdf,.doc,.docx,.ppt,.pptx,.zip" onChange={onFile} />
              {fileName && (
                <p className="mt-1 text-xs text-muted-foreground">
                  {fileName} · {sizeLabel} · recorded in HQ (prototype does not stream the file)
                </p>
              )}
            </div>
            <div className="sm:col-span-2">
              <Label htmlFor="mat-notes">Notes</Label>
              <Input id="mat-notes" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
            </div>
            <div className="sm:col-span-2">
              <Button type="submit" variant="brand">
                Add material
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
      <div className="space-y-3">
        {materials.length === 0 && (
          <p className="text-sm text-muted-foreground">No videos, links or files on this course yet.</p>
        )}
        {materials.map((item) => {
          const yt = item.kind === "video" ? youtubeId(item.url) : null;
          const Icon = item.kind === "video" ? Video : item.kind === "document" ? FileText : Link2;
          return (
            <Card key={item.id}>
              <CardContent className="space-y-3">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                    <Icon className="size-4 text-navy" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-navy">{item.title}</p>
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">{item.kind}</p>
                    {item.fileName && (
                      <p className="text-xs text-muted-foreground">
                        {item.fileName}
                        {item.sizeLabel ? ` · ${item.sizeLabel}` : ""}
                      </p>
                    )}
                    {item.notes && <p className="mt-1 text-sm text-muted-foreground">{item.notes}</p>}
                    {item.url && (
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-navy hover:underline"
                      >
                        Open resource <ExternalLink className="size-3" />
                      </a>
                    )}
                  </div>
                </div>
                {yt && (
                  <div className="aspect-video overflow-hidden rounded-lg bg-navy">
                    <iframe
                      title={item.title}
                      src={`https://www.youtube.com/embed/${yt}`}
                      className="h-full w-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
