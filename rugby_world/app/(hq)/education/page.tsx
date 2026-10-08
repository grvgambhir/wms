"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { isOnCourse } from "@/lib/education";

export default function EducationPage() {
  const { state, decideEnrolment } = useStore();
  const [query, setQuery] = useState("");
  const courses = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.courses
      .filter((course) => !q || `${course.title} ${course.category} ${course.targetRole}`.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => a.title.localeCompare(b.title));
  }, [state.courses, query]);
  const live = state.courses.filter((course) => course.status === "published").length;
  const requests = useMemo(
    () =>
      state.learners
        .filter((row) => row.status === "requested")
        .slice()
        .sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt)),
    [state.learners]
  );

  return (
    <div>
      <PageHeader
        eyebrow="Education"
        title="Courses"
        description="People request a place. HQ accepts them onto the course, then they take lessons, exam and project."
        actions={
          <Link href="/education/new" className="wr-btn inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium">
            Create course
          </Link>
        }
      />
      {requests.length > 0 && (
        <section className="mb-6 rounded-xl border bg-card p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <div>
              <h2 className="font-heading text-lg font-semibold text-navy">Places to review</h2>
              <p className="text-sm text-muted-foreground">{requests.length} waiting for a decision.</p>
            </div>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-3 py-2">Applicant</th>
                  <th className="px-3 py-2">Course</th>
                  <th className="px-3 py-2">Requested</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {requests.map((row) => {
                  const course = state.courses.find((item) => item.id === row.courseId);
                  return (
                    <tr key={row.id} className="border-t">
                      <td className="px-3 py-2">
                        <Link href={`/education/${row.courseId}/learners/${row.id}`} className="font-medium text-navy hover:underline">
                          {row.name}
                        </Link>
                        <p className="text-xs text-muted-foreground">{row.unionName}</p>
                      </td>
                      <td className="px-3 py-2">
                        <Link href={`/education/${row.courseId}`} className="hover:underline">
                          {course?.title ?? row.courseId}
                        </Link>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(row.enrolledAt)}</td>
                      <td className="px-3 py-2">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="brand"
                            data-enrol-action="accept"
                            data-learner-name={row.name}
                            onClick={() => {
                              if (!decideEnrolment(row.id, "accepted")) {
                                toast.error("Could not accept that request.");
                                return;
                              }
                              toast.success(`${row.name} is on the course.`);
                            }}
                          >
                            Accept
                          </Button>
                          <Link
                            href={`/education/${row.courseId}`}
                            className="inline-flex h-8 items-center rounded-lg border px-3 text-xs font-medium"
                          >
                            Review
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Input
          className="max-w-sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search courses"
        />
        <p className="text-sm text-muted-foreground">
          {live} live · {state.courses.length - live} draft · {requests.length} requests ·{" "}
          <Link href="/education/certificates" className="font-medium text-navy hover:underline">
            Search credentials
          </Link>
        </p>
      </div>
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Requests</th>
              <th className="px-4 py-3">On course</th>
              <th className="px-4 py-3">Certificates</th>
            </tr>
          </thead>
          <tbody>
            {courses.map((course) => {
              const enrolled = state.learners.filter((row) => row.courseId === course.id && isOnCourse(row.status)).length;
              const waiting = state.learners.filter((row) => row.courseId === course.id && row.status === "requested").length;
              const issued = state.certificates.filter((row) => row.courseId === course.id).length;
              return (
                <tr key={course.id} className="border-t">
                  <td className="px-4 py-3">
                    <Link href={`/education/${course.id}`} className="font-medium text-navy hover:underline">
                      {course.title}
                    </Link>
                    <p className="text-xs text-muted-foreground">{course.durationHours}h · pass {course.passMark}%</p>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{course.category}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={course.status} />
                  </td>
                  <td className="px-4 py-3 tabular-nums">{waiting || "—"}</td>
                  <td className="px-4 py-3 tabular-nums">{enrolled}</td>
                  <td className="px-4 py-3 tabular-nums">{issued}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
