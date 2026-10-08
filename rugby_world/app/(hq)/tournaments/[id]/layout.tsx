"use client";

import { TournamentHubShell } from "@/components/tournaments/hub-shell";

export default function TournamentHubLayout({ children }: { children: React.ReactNode }) {
  return <TournamentHubShell>{children}</TournamentHubShell>;
}
