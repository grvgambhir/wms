"use client";

import { LicenseWorkspace } from "@/components/licenses/license-workspace";
import { useParams } from "next/navigation";

export default function LicensePage() {
  const { id } = useParams<{ id: string }>();
  return <LicenseWorkspace licenseId={id} />;
}
