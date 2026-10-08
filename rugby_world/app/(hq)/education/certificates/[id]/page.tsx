"use client";

import { useParams } from "next/navigation";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/logo";
import { formatDate } from "@/lib/format";
import { certificateValidity } from "@/lib/education";

export default function CertificatePage() {
  const { id } = useParams<{ id: string }>();
  const { state } = useStore();
  const certificate = state.certificates.find((c) => c.id === id);
  const learner = state.learners.find((row) => row.id === certificate?.learnerId);
  const course = state.courses.find((c) => c.id === certificate?.courseId);

  if (!certificate || !course) {
    return <p className="text-sm text-muted-foreground">Certificate not found.</p>;
  }

  return (
    <div>
      <PageHeader
        eyebrow="Certificate"
        title="Certificate"
        description={`${certificate.credentialId} · ${course.title}`}
        back={{ href: `/education/${course.id}`, label: "Back to course" }}
        actions={
          <Button type="button" variant="outline" onClick={() => window.print()}>
            Print / save
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl rounded-xl border-2 border-navy bg-white p-8 shadow-sm print:border print:shadow-none">
        <div className="flex items-center justify-between gap-4 border-b border-navy/15 pb-4">
          <Logo />
          <p className="text-right text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">
            Education &amp; courses
          </p>
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">This is to certify that</p>
        <h2 className="mt-2 text-center font-heading text-3xl font-semibold text-navy">{certificate.holder}</h2>
        <p className="mt-1 text-center text-sm text-muted-foreground">
          {learner?.role ? `${learner.role} · ` : ""}
          {certificate.unionName}
        </p>
        <p className="mt-8 text-center text-sm text-muted-foreground">has completed</p>
        <p className="mt-2 text-center font-heading text-2xl font-semibold text-navy">{course.title}</p>
        <p className="mt-2 text-center text-sm text-muted-foreground">
          {course.category} · pass mark {course.passMark}% · {course.durationHours} hours
        </p>
        <div className="mt-10 grid gap-4 text-center text-sm sm:grid-cols-3">
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Issued</p>
            <p className="font-medium text-navy">{formatDate(certificate.issuedAt)}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Credential</p>
            <p className="font-medium text-navy">{certificate.credentialId}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Valid until</p>
            <p className="font-medium text-navy">{certificate.expiresAt ? formatDate(certificate.expiresAt) : "No expiry"}</p>
            <div className="mt-1 flex justify-center">
              <StatusBadge status={certificateValidity(certificate.expiresAt)} />
            </div>
          </div>
        </div>
        <p className="mt-10 text-center text-xs text-muted-foreground">
          Issued by World Rugby HQ · Competitions &amp; Integrity Directorate · prototype record
        </p>
      </div>
    </div>
  );
}
