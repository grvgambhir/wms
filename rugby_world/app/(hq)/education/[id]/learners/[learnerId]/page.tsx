"use client";

import { FormEvent, useState } from "react";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { examForCourse, examScore, isOnCourse, projectForCourse } from "@/lib/education";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function LearnerCoursePage() {
  const { id, learnerId } = useParams<{ id: string; learnerId: string }>();
  const { state, saveExamAnswers, submitProject, decideEnrolment } = useStore();
  const course = state.courses.find((row) => row.id === id);
  const learner = state.learners.find((row) => row.id === learnerId && row.courseId === id);
  const questions = examForCourse(id);
  const project = projectForCourse(id);
  const [picks, setPicks] = useState<Record<string, number>>(() => {
    const start: Record<string, number> = {};
    for (const answer of learner?.examAnswers ?? []) start[answer.questionId] = answer.selectedIndex;
    return start;
  });
  const [fileName, setFileName] = useState(learner?.project?.fileName ?? "");
  const [notes, setNotes] = useState(learner?.project?.notes ?? "");
  const [declineNote, setDeclineNote] = useState("");
  const [showDecline, setShowDecline] = useState(false);

  if (!course || !learner) {
    return <p className="text-sm text-muted-foreground">Enrolment not found.</p>;
  }

  const waiting = learner.status === "requested";
  const refused = learner.status === "declined";
  const admitted = isOnCourse(learner.status);
  const submitted = Boolean(learner.examSubmittedAt);
  const score = submitted ? examScore(questions, learner.examAnswers ?? []) : null;

  function onExam(e: FormEvent) {
    e.preventDefault();
    const answers = questions.map((question) => ({
      questionId: question.id,
      selectedIndex: picks[question.id],
    }));
    if (answers.some((row) => row.selectedIndex == null)) {
      toast.error("Answer every question before submitting.");
      return;
    }
    if (!saveExamAnswers(learnerId, answers)) {
      toast.error("Could not save the exam.");
      return;
    }
    toast.success("Exam submitted. You can review your answers below.");
  }

  function onProject(e: FormEvent) {
    e.preventDefault();
    if (!submitProject(learnerId, { title: project.title, fileName, notes })) {
      toast.error("Could not submit the project.");
      return;
    }
    toast.success("Project submitted.");
  }

  return (
    <div>
      <PageHeader
        eyebrow={course.title}
        title={learner.name}
        description={`${learner.unionName}${learner.role ? ` · ${learner.role}` : ""} · requested ${formatDate(learner.enrolledAt)}`}
        back={{ href: `/education/${course.id}`, label: "Back to course" }}
        actions={<StatusBadge status={learner.status} />}
      />

      {waiting && (
        <section className="mb-6 rounded-xl border bg-amber-50 p-4">
          <h2 className="font-heading text-lg font-semibold text-navy">Waiting for HQ</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            This person asked for a place. Accept them to open lessons, exam and project. Decline if they should not take the course.
          </p>
          {showDecline ? (
            <div className="grid max-w-md gap-2">
              <Label htmlFor="decline-note">Reason</Label>
              <Textarea
                id="decline-note"
                rows={2}
                value={declineNote}
                onChange={(e) => setDeclineNote(e.target.value)}
                placeholder="Not listed as competition medical staff."
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    if (!decideEnrolment(learner.id, "declined", declineNote)) {
                      toast.error("Could not decline that request.");
                      return;
                    }
                    toast.success(`${learner.name} was declined.`);
                    setShowDecline(false);
                  }}
                >
                  Confirm decline
                </Button>
                <Button type="button" variant="ghost" onClick={() => setShowDecline(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="brand"
                data-enrol-action="accept"
                data-learner-name={learner.name}
                onClick={() => {
                  if (!decideEnrolment(learner.id, "accepted")) {
                    toast.error("Could not accept that request.");
                    return;
                  }
                  toast.success(`${learner.name} is on the course.`);
                }}
              >
                Accept enrolment
              </Button>
              <Button type="button" variant="outline" onClick={() => setShowDecline(true)}>
                Decline
              </Button>
            </div>
          )}
        </section>
      )}

      {refused && (
        <section className="mb-6 rounded-xl border bg-muted/40 p-4">
          <h2 className="font-heading text-lg font-semibold text-navy">Request declined</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            {learner.decisionNote || "HQ declined this place. They cannot take the exam."}
            {learner.decidedAt ? ` · ${formatDate(learner.decidedAt)}` : ""}
          </p>
          <Button
            type="button"
            variant="brand"
            onClick={() => {
              if (!decideEnrolment(learner.id, "accepted")) {
                toast.error("Could not accept that request.");
                return;
              }
              toast.success(`${learner.name} is on the course.`);
            }}
          >
            Accept now
          </Button>
        </section>
      )}

      {admitted && (
        <p className="mb-6 rounded-lg border bg-muted/40 px-4 py-3 text-sm text-navy">
          Learner view. Exam answers and the project live here so the person (and HQ) can open the same record.
        </p>
      )}

      {admitted && (
        <>
          <section className="mb-8 rounded-xl border bg-card p-4">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
              <div>
                <h2 className="font-heading text-lg font-semibold text-navy">Exam</h2>
                <p className="text-sm text-muted-foreground">
                  {submitted
                    ? `Submitted ${learner.examSubmittedAt ? formatDate(learner.examSubmittedAt) : ""}${score != null ? ` · ${score}%` : ""}`
                    : "Answer the questions, then submit. You can open this page again to review."}
                </p>
              </div>
              {learner.score != null && <p className="font-heading text-2xl text-navy">{learner.score}%</p>}
            </div>
            <form onSubmit={onExam} className="space-y-4">
              {questions.map((question, index) => {
                const chosen = submitted
                  ? learner.examAnswers?.find((row) => row.questionId === question.id)?.selectedIndex
                  : picks[question.id];
                return (
                  <div key={question.id} className="rounded-lg border px-3 py-3">
                    <p className="mb-2 font-medium text-navy">
                      {index + 1}. {question.prompt}
                    </p>
                    <div className="space-y-1.5">
                      {question.options.map((option, optionIndex) => {
                        const selected = chosen === optionIndex;
                        const correct = submitted && optionIndex === question.correctIndex;
                        const wrong = submitted && selected && optionIndex !== question.correctIndex;
                        return (
                          <label
                            key={option}
                            className={cn(
                              "flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm",
                              selected && !submitted && "bg-muted",
                              correct && "bg-emerald-50 text-emerald-950",
                              wrong && "bg-red-50 text-red-900"
                            )}
                          >
                            <input
                              type="radio"
                              className="mt-1"
                              name={question.id}
                              disabled={submitted}
                              checked={chosen === optionIndex}
                              onChange={() => setPicks((current) => ({ ...current, [question.id]: optionIndex }))}
                            />
                            <span>
                              {option}
                              {submitted && optionIndex === question.correctIndex ? " · correct" : ""}
                              {wrong ? " · your answer" : ""}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {!submitted && (
                <Button type="submit" variant="brand">
                  Submit exam
                </Button>
              )}
            </form>
          </section>

          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">Project</h2>
            <p className="mb-1 text-sm font-medium text-navy">{project.title}</p>
            <p className="mb-4 text-sm text-muted-foreground">{project.brief}</p>
            {learner.project ? (
              <div className="space-y-2 rounded-lg border px-3 py-3 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-navy">{learner.project.fileName}</p>
                  <StatusBadge status={learner.project.status} />
                </div>
                <p className="text-muted-foreground">Submitted {formatDate(learner.project.submittedAt)}</p>
                {learner.project.notes ? <p>{learner.project.notes}</p> : null}
                {learner.project.grade != null ? <p className="tabular-nums">Project grade {learner.project.grade}%</p> : null}
                {learner.project.feedback ? <p className="text-muted-foreground">{learner.project.feedback}</p> : null}
              </div>
            ) : (
              <form onSubmit={onProject} className="grid max-w-xl gap-3">
                <div>
                  <Label htmlFor="proj-file">File name</Label>
                  <Input id="proj-file" value={fileName} onChange={(e) => setFileName(e.target.value)} placeholder="HIA-case-review.pdf" />
                </div>
                <div>
                  <Label htmlFor="proj-notes">Notes</Label>
                  <Textarea id="proj-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="What you submitted and any comments for the tutor." />
                </div>
                <Button type="submit" variant="brand">
                  Submit project
                </Button>
              </form>
            )}
          </section>
        </>
      )}
    </div>
  );
}
