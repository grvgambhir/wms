"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { CourseMaterialsPanel } from "@/components/education/materials-panel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { certificateValidity, examForCourse, isOnCourse, projectForCourse } from "@/lib/education";
import { cn } from "@/lib/utils";
import type { CourseCategory } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";
const CATEGORIES: CourseCategory[] = [
  "Coaching",
  "Match Officials",
  "Medical",
  "Strength & Conditioning",
  "Laws",
];

type Tab = "content" | "learners" | "submissions" | "certificates" | "settings";

export function CourseWorkspace({ courseId }: { courseId: string }) {
  const { state, addCourseModule, setCourseStatus, updateCourse, enrollLearner, decideEnrolment, recordLearnerResult, issueCertificate } =
    useStore();
  const course = state.courses.find((row) => row.id === courseId);
  const [tab, setTab] = useState<Tab>("content");
  const [moduleTitle, setModuleTitle] = useState("");
  const [moduleMinutes, setModuleMinutes] = useState("30");
  const [name, setName] = useState("");
  const [unionId, setUnionId] = useState(state.unions[0]?.id ?? "");
  const [query, setQuery] = useState("");
  const [scores, setScores] = useState<Record<string, string>>({});
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [declineNote, setDeclineNote] = useState("");
  const [title, setTitle] = useState(course?.title ?? "");
  const [description, setDescription] = useState(course?.description ?? "");
  const [category, setCategory] = useState<CourseCategory>(course?.category ?? "Coaching");
  const [targetRole, setTargetRole] = useState(course?.targetRole ?? "");
  const [durationHours, setDurationHours] = useState(String(course?.durationHours ?? 4));
  const [passMark, setPassMark] = useState(String(course?.passMark ?? 80));
  const [mandatory, setMandatory] = useState(course?.mandatory ?? false);
  const [awardsCertificate, setAwardsCertificate] = useState(course?.awardsCertificate ?? true);

  const courseLearners = useMemo(
    () => state.learners.filter((row) => row.courseId === courseId),
    [state.learners, courseId]
  );
  const learners = useMemo(() => {
    const q = query.trim().toLowerCase();
    return courseLearners.filter((row) => !q || `${row.name} ${row.unionName} ${row.email ?? ""}`.toLowerCase().includes(q));
  }, [courseLearners, query]);
  const pending = useMemo(
    () => courseLearners.filter((row) => row.status === "requested").sort((a, b) => b.enrolledAt.localeCompare(a.enrolledAt)),
    [courseLearners]
  );
  const roster = useMemo(
    () => learners.filter((row) => isOnCourse(row.status)).sort((a, b) => a.name.localeCompare(b.name)),
    [learners]
  );
  const declined = useMemo(
    () => courseLearners.filter((row) => row.status === "declined").sort((a, b) => (b.decidedAt ?? b.enrolledAt).localeCompare(a.decidedAt ?? a.enrolledAt)),
    [courseLearners]
  );
  const certificates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.certificates
      .filter((row) => row.courseId === courseId)
      .filter((row) => !q || `${row.holder} ${row.credentialId} ${row.unionName}`.toLowerCase().includes(q))
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [state.certificates, courseId, query]);

  if (!course) return <p className="text-sm text-muted-foreground">Course not found.</p>;
  const current = course;
  const exam = examForCourse(course.id);
  const project = projectForCourse(course.id);
  const submissions = state.learners.filter((row) => row.courseId === courseId && row.project);

  const live = course.status === "published";
  const tabs: { id: Tab; label: string }[] = [
    { id: "content", label: "Content" },
    { id: "learners", label: `Enrolments${pending.length ? ` (${pending.length})` : ""}` },
    { id: "submissions", label: "Submissions" },
    { id: "certificates", label: `Certificates (${state.certificates.filter((row) => row.courseId === courseId).length})` },
    { id: "settings", label: "Settings" },
  ];

  function onAddModule(e: FormEvent) {
    e.preventDefault();
    if (!moduleTitle.trim()) {
      toast.error("Module title is required.");
      return;
    }
    addCourseModule(courseId, { title: moduleTitle.trim(), minutes: Number(moduleMinutes) || 30 });
    setModuleTitle("");
    toast.success("Week added.");
  }

  function onEnroll(e: FormEvent) {
    e.preventDefault();
    const id = enrollLearner({ courseId, name, unionId });
    if (!id) {
      toast.error("Could not enrol that person.");
      return;
    }
    toast.success(`${name.trim()} asked for a place. Accept them below to open the course.`);
    setName("");
  }

  function onAccept(learnerId: string, personName: string) {
    if (!decideEnrolment(learnerId, "accepted")) {
      toast.error("Could not accept that request.");
      return;
    }
    setDecliningId(null);
    toast.success(`${personName} is on the course.`);
  }

  function onDecline(learnerId: string, personName: string) {
    if (!decideEnrolment(learnerId, "declined", declineNote)) {
      toast.error("Could not decline that request.");
      return;
    }
    setDecliningId(null);
    setDeclineNote("");
    toast.success(`${personName} was declined.`);
  }

  function onSaveSettings(e: FormEvent) {
    e.preventDefault();
    updateCourse(courseId, {
      title: title.trim() || current.title,
      description: description.trim(),
      category,
      targetRole: targetRole.trim() || current.targetRole,
      durationHours: Number(durationHours) || current.durationHours,
      passMark: Number(passMark) || current.passMark,
      mandatory,
      awardsCertificate,
    });
    toast.success("Course saved.");
  }

  return (
    <div>
      <PageHeader
        eyebrow={course.category}
        title={course.title}
        description={course.description}
        back={{ href: "/education", label: "Back to catalog" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={course.status} />
            <Button
              type="button"
              variant={live ? "outline" : "brand"}
              onClick={() => {
                setCourseStatus(course.id, live ? "draft" : "published");
                toast.success(live ? "Unpublished. Hidden from the catalog." : "Published. Learners can take this course.");
              }}
            >
              {live ? "Unpublish" : "Publish"}
            </Button>
          </div>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {tabs.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setTab(row.id)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              tab === row.id ? "border-navy bg-navy text-white" : "bg-card hover:bg-muted/60"
            )}
          >
            {row.label}
          </button>
        ))}
      </div>

      {tab === "content" && (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">Syllabus</h2>
            <p className="mb-4 text-sm text-muted-foreground">Weeks and sessions learners work through in order.</p>
            <ol className="mb-4 space-y-2">
              {course.modules.map((module, index) => (
                <li key={`${module.title}-${index}`} className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm">
                  <span className="font-medium text-navy">
                    {index + 1}. {module.title}
                  </span>
                  <span className="text-muted-foreground">{module.minutes} min</span>
                </li>
              ))}
            </ol>
            <form onSubmit={onAddModule} className="grid gap-2 sm:grid-cols-[1fr_90px_auto]">
              <div>
                <Label htmlFor="mod-title">Add week</Label>
                <Input id="mod-title" value={moduleTitle} onChange={(e) => setModuleTitle(e.target.value)} placeholder="Assessment" />
              </div>
              <div>
                <Label htmlFor="mod-min">Minutes</Label>
                <Input id="mod-min" type="number" min="1" value={moduleMinutes} onChange={(e) => setModuleMinutes(e.target.value)} />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="brand">
                  Add
                </Button>
              </div>
            </form>
          </section>
          <section>
            <h2 className="mb-1 font-heading text-lg font-semibold text-navy">Lessons</h2>
            <p className="mb-4 text-sm text-muted-foreground">Videos, readings and files for this course.</p>
            <CourseMaterialsPanel courseId={course.id} />
          </section>
          <section className="rounded-xl border bg-card p-4 lg:col-span-2">
            <h2 className="font-heading text-lg font-semibold text-navy">Exam</h2>
            <p className="mb-3 text-sm text-muted-foreground">Learners sit this after the lessons. Open a person to see their answers.</p>
            <ol className="space-y-2 text-sm">
              {exam.map((question, index) => (
                <li key={question.id}>
                  <span className="font-medium text-navy">
                    {index + 1}. {question.prompt}
                  </span>
                  <span className="text-muted-foreground"> · {question.options.length} options</span>
                </li>
              ))}
            </ol>
            <h2 className="mt-6 font-heading text-lg font-semibold text-navy">Project</h2>
            <p className="mt-1 text-sm font-medium text-navy">{project.title}</p>
            <p className="text-sm text-muted-foreground">{project.brief}</p>
          </section>
        </div>
      )}

      {tab === "learners" && (
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">Requests</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              People apply for a place. Accept them onto the roster, or decline with a note. They cannot sit the exam until accepted.
            </p>
            <form onSubmit={onEnroll} className="mb-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]">
              <div>
                <Label htmlFor="lr-name">Name</Label>
                <Input id="lr-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Dr Priya Shah" />
              </div>
              <div>
                <Label>Union</Label>
                <select className={field} value={unionId} onChange={(e) => setUnionId(e.target.value)}>
                  {state.unions.map((union) => (
                    <option key={union.id} value={union.id}>
                      {union.flag} {union.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="brand">
                  Add request
                </Button>
              </div>
            </form>
            {pending.length === 0 ? (
              <p className="text-sm text-muted-foreground">No requests waiting.</p>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Applicant</th>
                      <th className="px-3 py-2">Union</th>
                      <th className="px-3 py-2">Requested</th>
                      <th className="px-3 py-2">Decision</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((row) => (
                      <tr key={row.id} className="border-t align-top">
                        <td className="px-3 py-2">
                          <Link href={`/education/${courseId}/learners/${row.id}`} className="font-medium text-navy hover:underline">
                            {row.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{row.email ?? row.role}</p>
                        </td>
                        <td className="px-3 py-2">{row.unionName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{formatDate(row.enrolledAt)}</td>
                        <td className="px-3 py-2">
                          {decliningId === row.id ? (
                            <div className="grid max-w-sm gap-2">
                              <Input
                                value={declineNote}
                                onChange={(e) => setDeclineNote(e.target.value)}
                                placeholder="Reason (optional)"
                              />
                              <div className="flex flex-wrap gap-2">
                                <Button type="button" size="sm" variant="outline" onClick={() => onDecline(row.id, row.name)}>
                                  Confirm decline
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setDecliningId(null);
                                    setDeclineNote("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              <Button
                                type="button"
                                size="sm"
                                variant="brand"
                                data-enrol-action="accept"
                                data-learner-name={row.name}
                                onClick={() => onAccept(row.id, row.name)}
                              >
                                Accept
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                data-enrol-action="decline"
                                onClick={() => {
                                  setDecliningId(row.id);
                                  setDeclineNote("");
                                }}
                              >
                                Decline
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">On the course</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Accepted people. Enter a score if they sat the exam elsewhere; a pass issues the certificate automatically.
            </p>
            <Input
              className="mb-3 max-w-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search learners"
            />
            {roster.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nobody accepted yet.</p>
            ) : (
              <div className="max-h-[28rem] overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Learner</th>
                      <th className="px-3 py-2">Union</th>
                      <th className="px-3 py-2">Progress</th>
                      <th className="px-3 py-2">Grade</th>
                      <th className="px-3 py-2">Work</th>
                      <th className="px-3 py-2">Certificate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {roster.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">
                          <Link href={`/education/${courseId}/learners/${row.id}`} className="font-medium text-navy hover:underline">
                            {row.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{row.email ?? row.role}</p>
                        </td>
                        <td className="px-3 py-2">{row.unionName}</td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.status} />
                        </td>
                        <td className="px-3 py-2">
                          {row.status === "passed" || row.status === "failed" ? (
                            <span className="tabular-nums">{row.score}%</span>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Input
                                className="w-20"
                                inputMode="numeric"
                                placeholder="%"
                                value={scores[row.id] ?? ""}
                                onChange={(e) => setScores((current) => ({ ...current, [row.id]: e.target.value }))}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  const score = Number(scores[row.id]);
                                  if (!recordLearnerResult(row.id, score)) {
                                    toast.error("Enter a score from 0 to 100.");
                                    return;
                                  }
                                  toast.success("Grade saved.");
                                }}
                              >
                                Save
                              </Button>
                            </div>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          <Link href={`/education/${courseId}/learners/${row.id}`} className="font-medium text-navy hover:underline">
                            {row.examSubmittedAt ? "Exam" : "Open"}
                            {row.project ? " · project" : ""}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {row.certificateId ? (
                            <Link href={`/education/certificates/${row.certificateId}`} className="font-medium text-navy hover:underline">
                              View
                            </Link>
                          ) : row.status === "passed" && course.awardsCertificate ? (
                            <Button
                              type="button"
                              size="sm"
                              variant="brand"
                              onClick={() => {
                                const id = issueCertificate({ learnerId: row.id });
                                if (!id) {
                                  toast.error("Could not issue the certificate.");
                                  return;
                                }
                                toast.success("Certificate issued.");
                              }}
                            >
                              Issue
                            </Button>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {declined.length > 0 && (
            <section className="rounded-xl border bg-card p-4">
              <h2 className="font-heading text-lg font-semibold text-navy">Declined</h2>
              <p className="mb-4 text-sm text-muted-foreground">Kept on file. Accept later if the union follows up.</p>
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Applicant</th>
                      <th className="px-3 py-2">Union</th>
                      <th className="px-3 py-2">Note</th>
                      <th className="px-3 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {declined.map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">
                          <Link href={`/education/${courseId}/learners/${row.id}`} className="font-medium text-navy hover:underline">
                            {row.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">
                            Requested {formatDate(row.enrolledAt)}
                            {row.decidedAt ? ` · declined ${formatDate(row.decidedAt)}` : ""}
                          </p>
                        </td>
                        <td className="px-3 py-2">{row.unionName}</td>
                        <td className="px-3 py-2 text-muted-foreground">{row.decisionNote || "—"}</td>
                        <td className="px-3 py-2">
                          <Button type="button" size="sm" variant="outline" onClick={() => onAccept(row.id, row.name)}>
                            Accept
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      )}

      {tab === "submissions" && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold text-navy">Project submissions</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {project.title}. Open a learner to read the exam answers and the file they handed in.
          </p>
          {submissions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No projects handed in yet.</p>
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Learner</th>
                    <th className="px-3 py-2">File</th>
                    <th className="px-3 py-2">Submitted</th>
                    <th className="px-3 py-2">Status</th>
                    <th className="px-3 py-2">Grade</th>
                  </tr>
                </thead>
                <tbody>
                  {submissions
                    .slice()
                    .sort((a, b) => (b.project?.submittedAt ?? "").localeCompare(a.project?.submittedAt ?? ""))
                    .map((row) => (
                      <tr key={row.id} className="border-t">
                        <td className="px-3 py-2">
                          <Link href={`/education/${courseId}/learners/${row.id}`} className="font-medium text-navy hover:underline">
                            {row.name}
                          </Link>
                          <p className="text-xs text-muted-foreground">{row.unionName}</p>
                        </td>
                        <td className="px-3 py-2">{row.project?.fileName}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {row.project ? formatDate(row.project.submittedAt) : ""}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge status={row.project?.status ?? "submitted"} />
                        </td>
                        <td className="px-3 py-2 tabular-nums">{row.project?.grade != null ? `${row.project.grade}%` : "—"}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "certificates" && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold text-navy">Issued credentials</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            {course.awardsCertificate
              ? "Certificates are created when a learner passes."
              : "This course does not award a certificate."}
          </p>
          <Input
            className="mb-3 max-w-sm"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search holder or credential"
          />
          {certificates.length === 0 ? (
            <p className="text-sm text-muted-foreground">None issued yet.</p>
          ) : (
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2">Holder</th>
                    <th className="px-3 py-2">Union</th>
                    <th className="px-3 py-2">Credential</th>
                    <th className="px-3 py-2">Issued</th>
                    <th className="px-3 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {certificates.map((cert) => (
                    <tr key={cert.id} className="border-t">
                      <td className="px-3 py-2">
                        <Link href={`/education/certificates/${cert.id}`} className="font-medium text-navy hover:underline">
                          {cert.holder}
                        </Link>
                      </td>
                      <td className="px-3 py-2">{cert.unionName}</td>
                      <td className="px-3 py-2 font-mono text-xs">{cert.credentialId}</td>
                      <td className="px-3 py-2 text-muted-foreground">{formatDate(cert.issuedAt)}</td>
                      <td className="px-3 py-2">
                        <StatusBadge status={certificateValidity(cert.expiresAt)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {tab === "settings" && (
        <form onSubmit={onSaveSettings} className="max-w-2xl space-y-4 rounded-xl border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold text-navy">Course settings</h2>
          <div>
            <Label htmlFor="set-title">Title</Label>
            <Input id="set-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <Label htmlFor="set-desc">About</Label>
            <Textarea id="set-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Category</Label>
              <select className={field} value={category} onChange={(e) => setCategory(e.target.value as CourseCategory)}>
                {CATEGORIES.map((row) => (
                  <option key={row} value={row}>
                    {row}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="set-role">Who it is for</Label>
              <Input id="set-role" value={targetRole} onChange={(e) => setTargetRole(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="set-hours">Duration (hours)</Label>
              <Input id="set-hours" type="number" min="1" value={durationHours} onChange={(e) => setDurationHours(e.target.value)} />
            </div>
            <div>
              <Label htmlFor="set-pass">Pass mark (%)</Label>
              <Input id="set-pass" type="number" min="1" max="100" value={passMark} onChange={(e) => setPassMark(e.target.value)} />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={mandatory} onChange={(e) => setMandatory(e.target.checked)} />
            Required for competition staff
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={awardsCertificate} onChange={(e) => setAwardsCertificate(e.target.checked)} />
            Award a certificate on pass
          </label>
          {live && course.publishedAt ? (
            <p className="text-xs text-muted-foreground">Published {formatDate(course.publishedAt)}.</p>
          ) : (
            <p className="text-xs text-muted-foreground">Draft. Publish when the syllabus is ready.</p>
          )}
          <Button type="submit" variant="brand">
            Save settings
          </Button>
        </form>
      )}
    </div>
  );
}
