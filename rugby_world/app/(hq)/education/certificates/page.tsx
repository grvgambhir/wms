"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { certificateValidity } from "@/lib/education";

export default function CertificatesLookupPage() {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return state.certificates
      .filter((cert) => {
        const course = state.courses.find((row) => row.id === cert.courseId);
        return (
          !q ||
          `${cert.holder} ${cert.unionName} ${cert.credentialId} ${course?.title ?? ""}`.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.issuedAt.localeCompare(a.issuedAt));
  }, [state.certificates, state.courses, query]);

  return (
    <div>
      <PageHeader
        eyebrow="Education"
        title="Credentials"
        description="Look up an issued World Rugby certificate by name, union or credential ID."
        back={{ href: "/education", label: "Back to catalog" }}
      />
      <Input
        className="mb-4 max-w-sm"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Name, course or WR-EDU-…"
      />
      <div className="overflow-hidden rounded-xl border bg-card">
        <table className="w-full text-sm">
          <thead className="bg-muted/70 text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Holder</th>
              <th className="px-4 py-3">Course</th>
              <th className="px-4 py-3">Credential</th>
              <th className="px-4 py-3">Issued</th>
              <th className="px-4 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((cert) => {
              const course = state.courses.find((row) => row.id === cert.courseId);
              return (
                <tr key={cert.id} className="border-t">
                  <td className="px-4 py-3">
                    <Link href={`/education/certificates/${cert.id}`} className="font-medium text-navy hover:underline">
                      {cert.holder}
                    </Link>
                    <p className="text-xs text-muted-foreground">{cert.unionName}</p>
                  </td>
                  <td className="px-4 py-3">
                    {course ? (
                      <Link href={`/education/${course.id}`} className="hover:underline">
                        {course.title}
                      </Link>
                    ) : (
                      cert.courseId
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs">{cert.credentialId}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(cert.issuedAt)}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={certificateValidity(cert.expiresAt)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
