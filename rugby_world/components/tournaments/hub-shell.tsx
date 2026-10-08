"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { MANAGER_TABS, buildSetupJourney, venuesForCompetition } from "@/lib/tournament-hub";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { SetupJourney } from "@/components/tournaments/setup-journey";
import type { TmsModule } from "@/lib/types";

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] font-semibold tracking-[0.16em] text-white/55 uppercase">{label}</p>
      <p className="mt-0.5 text-sm font-medium text-white">{value}</p>
    </div>
  );
}

export function TournamentHubShell({ children }: { children: React.ReactNode }) {
  const { id } = useParams<{ id: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { state, deleteCompetition } = useStore();
  const competition = state.competitions.find((c) => c.id === id);

  if (!competition) {
    return <p className="text-sm text-muted-foreground">Competition not found.</p>;
  }
  const current = competition;

  const base = `/tournaments/${current.id}`;
  const matches = state.matches.filter((m) => m.competitionId === current.id);
  const squads = state.teams.filter((t) => t.competitionIds.includes(current.id));
  const venues = venuesForCompetition(state.venues, current);
  const formatLabel = current.format === "7s" ? "Sevens" : current.format === "u20" ? "Under-20" : "15s";
  const license = current.licenseId ? state.licenses.find((row) => row.id === current.licenseId) : undefined;
  const tabs = license
    ? MANAGER_TABS.filter((tab) => !tab.slug || license.modules.includes(tab.slug as TmsModule))
    : MANAGER_TABS;
  const journey = buildSetupJourney({
    competitionId: current.id,
    structure: current.structure,
    teamCount: squads.length,
    pools: current.pools,
    matches,
    modules: license?.modules,
  });

  function onDelete() {
    const ok = window.confirm(
      `Delete ${current.name}? Fixtures and operations for this event will be removed.`
    );
    if (!ok) return;
    deleteCompetition(current.id);
    toast.success("Tournament deleted.");
    router.push("/tournaments");
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link
          href="/tournaments"
          className="inline-flex items-center gap-1 text-sm font-medium text-navy hover:underline"
        >
          <ChevronLeft className="size-4" strokeWidth={2} />
          Back to tournaments
        </Link>
        {license && (
          <Link href={`/licenses/${license.id}`} className="text-sm font-medium text-navy hover:underline">
            Licence {license.licenseKey}
          </Link>
        )}
      </div>
      <section className="wr-gradient mb-4 overflow-hidden rounded-xl text-white">
        <div className="h-1 bg-gradient-to-r from-gold via-[#f0d36a] to-[#8d7014]" />
        <div className="px-5 py-5 sm:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">
                {current.shortName} · {current.season}
                {license ? ` · ${license.licenseKey}` : ""}
              </p>
              <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">{current.name}</h1>
              <p className="mt-1 max-w-3xl text-sm text-white/80">{current.description}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold tracking-wide uppercase">
                {current.status}
              </span>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="border border-white/30 bg-white/10 text-white hover:bg-red-600 hover:text-white"
                onClick={onDelete}
              >
                Delete tournament
              </Button>
            </div>
          </div>
          <div className="mt-5 grid gap-4 border-t border-white/15 pt-4 sm:grid-cols-2 lg:grid-cols-4">
            <Fact label="Host country" value={current.hostCountry} />
            <Fact label="Host union" value={current.hostUnion} />
            <Fact label="Host cities" value={current.hostCities} />
            <Fact label="Broadcaster" value={current.broadcaster || "TBC"} />
            <Fact
              label="Dates"
              value={`${formatDate(current.startDate)} - ${formatDate(current.endDate)}`}
            />
            <Fact label="Format" value={`${formatLabel} · ${current.structure || "TBC"}`} />
            <Fact label="Organiser" value={current.organiser} />
            <Fact
              label="Delivery"
              value={`${squads.length} teams · ${matches.length} fixtures · ${venues.length} venues`}
            />
          </div>
        </div>
      </section>
      <SetupJourney steps={journey} />
      <nav className="mb-6 flex gap-1 overflow-x-auto border-b border-border">
        {tabs.map((tab) => {
          const href = tab.slug ? `${base}/${tab.slug}` : base;
          const active = tab.slug === "" ? pathname === base : pathname === href;
          return (
            <Link
              key={tab.label}
              href={href}
              className={cn(
                "-mb-px shrink-0 border-b-2 px-3 py-2 text-sm font-medium",
                active
                  ? "border-navy text-navy"
                  : "border-transparent text-muted-foreground hover:text-navy"
              )}
            >
              {tab.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
