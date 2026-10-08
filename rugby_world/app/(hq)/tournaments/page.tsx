"use client";

import Link from "next/link";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { formatDate } from "@/lib/format";

export default function TournamentsPage() {
  const { state } = useStore();
  const worldRugby = state.competitions.filter((c) => !c.licenseId);
  const licensed = state.competitions.filter((c) => c.licenseId);
  return (
    <div>
      <PageHeader
        eyebrow="Module 01"
        title="Tournament Management"
        description="World Rugby competitions stay listed here. Member associations run their own events on a TMS licence."
        actions={
          <Link
            href="/tournaments/new"
            className="wr-btn inline-flex h-9 items-center rounded-lg px-4 text-sm font-medium"
          >
            Create tournament
          </Link>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/tournaments/teams" className="text-sm font-medium text-navy hover:underline">
          All teams
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/tournaments/venues" className="text-sm font-medium text-navy hover:underline">
          Venues register
        </Link>
        <span className="text-muted-foreground">·</span>
        <Link href="/licenses" className="text-sm font-medium text-navy hover:underline">
          TMS licences
        </Link>
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {worldRugby.map((c) => (
          <Link key={c.id} href={`/tournaments/${c.id}`}>
            <Card className="h-full transition-shadow hover:shadow-md">
              <CardContent className="pt-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] tracking-[0.16em] text-gold uppercase">{c.shortName}</p>
                    <h2 className="font-heading text-xl font-semibold text-navy">{c.name}</h2>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
                <p className="mt-4 text-xs text-muted-foreground">
                  {c.hostCountry} · {c.format} · {formatDate(c.startDate)} - {formatDate(c.endDate)} · {c.teams} teams
                </p>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
      {licensed.length > 0 && (
        <div className="mt-8">
          <h2 className="mb-3 font-heading text-lg font-semibold text-navy">Licensed to unions</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Events member associations are organising on a TMS sub-licence.
          </p>
          <div className="grid gap-4 md:grid-cols-2">
            {licensed.map((c) => {
              const license = state.licenses.find((row) => row.id === c.licenseId);
              const union = state.unions.find((row) => row.id === c.ownerUnionId);
              return (
                <Link key={c.id} href={`/tournaments/${c.id}`}>
                  <Card className="h-full transition-shadow hover:shadow-md">
                    <CardContent className="pt-1">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-[11px] tracking-[0.16em] text-gold uppercase">
                            {union?.flag} {union?.abbreviation} · {c.shortName}
                          </p>
                          <h2 className="font-heading text-xl font-semibold text-navy">{c.name}</h2>
                        </div>
                        <StatusBadge status={c.status} />
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{c.description}</p>
                      <p className="mt-4 text-xs text-muted-foreground">
                        {license?.licenseKey} · {formatDate(c.startDate)} - {formatDate(c.endDate)}
                      </p>
                    </CardContent>
                  </Card>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
