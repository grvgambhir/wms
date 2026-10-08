"use client";

import { CourseWorkspace } from "@/components/education/course-workspace";
import { useParams } from "next/navigation";

export default function CoursePage() {
  const { id } = useParams<{ id: string }>();
  return <CourseWorkspace courseId={id} />;
}
