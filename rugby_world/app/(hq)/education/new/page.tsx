"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { CourseCategory } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";
const CATEGORIES: CourseCategory[] = [
  "Coaching",
  "Match Officials",
  "Medical",
  "Strength & Conditioning",
  "Laws",
];

export default function NewCoursePage() {
  const router = useRouter();
  const { createCourse } = useStore();
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState<CourseCategory>("Coaching");
  const [description, setDescription] = useState("");

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const id = createCourse({
      title,
      category,
      durationHours: 4,
      targetRole: "Union staff",
      passMark: 80,
      mandatory: false,
      awardsCertificate: true,
      description,
      modules: [
        { title: "Introduction", minutes: 30 },
        { title: "Assessment", minutes: 20 },
      ],
    });
    toast.success("Course created as a draft.");
    router.push(`/education/${id}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Education"
        title="Create course"
        description="Add a title and open the course to build lessons, enrol learners and publish."
        back={{ href: "/education", label: "Back to catalog" }}
      />
      <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-xl border bg-card p-5">
        <div>
          <Label htmlFor="title">Course title</Label>
          <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Tackle height 2026" />
        </div>
        <div>
          <Label htmlFor="category">Category</Label>
          <select id="category" className={field} value={category} onChange={(e) => setCategory(e.target.value as CourseCategory)}>
            {CATEGORIES.map((row) => (
              <option key={row} value={row}>
                {row}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label htmlFor="desc">About this course</Label>
          <Textarea id="desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <Button type="submit" variant="brand">
          Create and open
        </Button>
      </form>
    </div>
  );
}
