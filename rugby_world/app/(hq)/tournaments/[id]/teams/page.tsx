"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function TournamentTeamsRedirect() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  useEffect(() => {
    router.replace(`/tournaments/${id}/roster`);
  }, [id, router]);
  return <p className="text-sm text-muted-foreground">Opening roster…</p>;
}
