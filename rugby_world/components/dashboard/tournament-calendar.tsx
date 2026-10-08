"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { Competition } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/shared/page-header";
import { formatDate } from "@/lib/format";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const TONES = [
  "bg-navy text-white",
  "bg-gold text-navy",
  "bg-emerald-800 text-white",
  "bg-sky-800 text-white",
  "bg-orange-800 text-white",
  "bg-violet-800 text-white",
];
const TINTS = [
  "bg-navy/15",
  "bg-gold/25",
  "bg-emerald-800/15",
  "bg-sky-800/15",
  "bg-orange-800/15",
  "bg-violet-800/15",
];

function parseDay(iso: string) {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1);
}

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function inRange(day: Date, competition: Competition) {
  const t = startOfDay(day).getTime();
  return t >= parseDay(competition.startDate).getTime() && t <= parseDay(competition.endDate).getTime();
}

function overlapsYear(competition: Competition, year: number) {
  return parseDay(competition.startDate) <= new Date(year, 11, 31) && parseDay(competition.endDate) >= new Date(year, 0, 1);
}

function overlapsMonth(competition: Competition, year: number, month: number) {
  return parseDay(competition.startDate) <= new Date(year, month + 1, 0) && parseDay(competition.endDate) >= new Date(year, month, 1);
}

function monthSpan(competition: Competition, year: number) {
  const start = parseDay(competition.startDate);
  const end = parseDay(competition.endDate);
  const from = start.getFullYear() < year ? 0 : start.getMonth();
  const to = end.getFullYear() > year ? 11 : end.getMonth();
  return { from, to };
}

function toneFor(index: number) {
  return TONES[index % TONES.length];
}

function tintFor(index: number) {
  return TINTS[index % TINTS.length];
}

function initialCursor(competitions: Competition[]) {
  const now = startOfDay(new Date());
  const active = competitions.find((c) => inRange(now, c));
  if (active) return { year: now.getFullYear(), month: now.getMonth() };
  const upcoming = [...competitions]
    .filter((c) => parseDay(c.endDate).getTime() >= now.getTime())
    .sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  if (upcoming) {
    const start = parseDay(upcoming.startDate);
    const date = start.getTime() > now.getTime() ? start : now;
    return { year: date.getFullYear(), month: date.getMonth() };
  }
  const last = [...competitions].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  const end = last ? parseDay(last.endDate) : now;
  return { year: end.getFullYear(), month: end.getMonth() };
}

function monthCells(year: number, month: number) {
  const first = new Date(year, month, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: { date: Date; inMonth: boolean }[] = [];
  for (let i = 0; i < startOffset; i += 1) {
    cells.push({ date: new Date(year, month, i - startOffset + 1), inMonth: false });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push({ date: new Date(year, month, day), inMonth: true });
  }
  while (cells.length % 7 !== 0) {
    const last = cells[cells.length - 1]?.date ?? first;
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), inMonth: false });
  }
  return cells;
}

export function TournamentCalendar({ competitions }: { competitions: Competition[] }) {
  const ordered = useMemo(
    () => [...competitions].sort((a, b) => a.startDate.localeCompare(b.startDate)),
    [competitions]
  );
  const colorIndex = useMemo(() => {
    const map = new Map<string, number>();
    ordered.forEach((c, index) => map.set(c.id, index));
    return map;
  }, [ordered]);
  const years = useMemo(() => {
    const set = new Set<number>();
    ordered.forEach((c) => {
      set.add(parseDay(c.startDate).getFullYear());
      set.add(parseDay(c.endDate).getFullYear());
    });
    return [...set].sort((a, b) => a - b);
  }, [ordered]);

  const [cursor, setCursor] = useState(() => initialCursor(ordered));
  const year = cursor.year;
  const month = cursor.month;
  const today = startOfDay(new Date());
  const cells = monthCells(year, month);
  const inMonth = ordered.filter((c) => overlapsMonth(c, year, month));
  const inYear = ordered.filter((c) => overlapsYear(c, year));

  function shiftMonth(delta: number) {
    const next = new Date(year, month + delta, 1);
    setCursor({ year: next.getFullYear(), month: next.getMonth() });
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
        <CardTitle>Tournament calendar</CardTitle>
        <div className="flex items-center gap-1">
          <Button type="button" size="icon-sm" variant="outline" onClick={() => shiftMonth(-1)} aria-label="Previous month">
            <ChevronLeft />
          </Button>
          <p className="min-w-[9.5rem] text-center text-sm font-medium text-navy">
            {MONTHS[month]} {year}
          </p>
          <Button type="button" size="icon-sm" variant="outline" onClick={() => shiftMonth(1)} aria-label="Next month">
            <ChevronRight />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        <div>
          <div className="mb-2 flex flex-wrap gap-1">
            {years.map((y) => (
              <button
                key={y}
                type="button"
                onClick={() => setCursor({ year: y, month: y === year ? month : 0 })}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium",
                  y === year ? "bg-navy text-white" : "bg-muted text-navy hover:bg-muted/80"
                )}
              >
                {y}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <div className="min-w-[640px]">
              <div className="mb-1 grid grid-cols-[8.5rem_repeat(12,minmax(0,1fr))] gap-1 text-center text-[11px] font-medium text-muted-foreground">
                <span />
                {MONTHS.map((label, index) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setCursor({ year, month: index })}
                    className={cn(
                      "rounded py-1 hover:bg-muted",
                      month === index && "bg-navy text-white hover:bg-navy"
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="space-y-1">
                {inYear.length === 0 && (
                  <p className="text-sm text-muted-foreground">No World Rugby tournaments in {year}.</p>
                )}
                {inYear.map((competition) => {
                  const span = monthSpan(competition, year);
                  const index = colorIndex.get(competition.id) ?? 0;
                  return (
                    <div key={competition.id} className="grid grid-cols-[8.5rem_repeat(12,minmax(0,1fr))] items-center gap-1">
                      <Link href={`/tournaments/${competition.id}`} className="truncate text-xs font-medium text-navy hover:underline">
                        {competition.shortName}
                      </Link>
                      {MONTHS.map((_, indexMonth) => {
                        const active = indexMonth >= span.from && indexMonth <= span.to;
                        return (
                          <button
                            key={`${competition.id}-${indexMonth}`}
                            type="button"
                            onClick={() => setCursor({ year, month: indexMonth })}
                            className={cn("h-6 rounded-sm", active ? toneFor(index) : "bg-muted/60")}
                            aria-label={`${competition.shortName} in ${MONTHS[indexMonth]} ${year}`}
                          />
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_16rem]">
          <div>
            <div className="grid grid-cols-7 text-center text-[11px] font-medium text-muted-foreground">
              {WEEKDAYS.map((day) => (
                <div key={day} className="py-1">
                  {day}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 overflow-hidden rounded-lg border">
              {cells.map(({ date, inMonth: currentMonth }) => {
                const events = ordered.filter((c) => inRange(date, c));
                const isToday = date.getTime() === today.getTime();
                const labels = events.filter(
                  (c) => sameDay(parseDay(c.startDate), date) || sameDay(parseDay(c.endDate), date)
                );
                const tint = events[0] ? tintFor(colorIndex.get(events[0].id) ?? 0) : "";
                return (
                  <div
                    key={date.toISOString()}
                    className={cn(
                      "min-h-[76px] border-b border-r p-1 [&:nth-child(7n)]:border-r-0",
                      !currentMonth && "bg-muted/40 text-muted-foreground",
                      currentMonth && tint,
                      isToday && "ring-1 ring-inset ring-gold"
                    )}
                  >
                    <p className={cn("text-[11px] font-medium", isToday && "text-navy")}>{date.getDate()}</p>
                    <div className="mt-1 space-y-0.5">
                      {labels.map((competition) => {
                        const index = colorIndex.get(competition.id) ?? 0;
                        const ending = sameDay(parseDay(competition.endDate), date);
                        return (
                          <Link
                            key={competition.id}
                            href={`/tournaments/${competition.id}`}
                            className={cn("block truncate rounded px-1 py-0.5 text-[10px] font-medium leading-tight", toneFor(index))}
                          >
                            {ending && !sameDay(parseDay(competition.startDate), date)
                              ? `${competition.shortName} ends`
                              : competition.shortName}
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              In {MONTHS[month]} {year}
            </p>
            {inMonth.length === 0 ? (
              <p className="text-sm text-muted-foreground">No tournaments this month. Use the year bars to jump to a window.</p>
            ) : (
              <ul className="space-y-2">
                {inMonth.map((competition) => {
                  const index = colorIndex.get(competition.id) ?? 0;
                  return (
                    <li key={competition.id}>
                      <Link
                        href={`/tournaments/${competition.id}`}
                        className={cn("block rounded-lg border px-3 py-2 hover:border-navy/30", tintFor(index))}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-medium text-navy">{competition.shortName}</p>
                          <StatusBadge status={competition.status} />
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{competition.name}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatDate(competition.startDate)} - {formatDate(competition.endDate)}
                        </p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
