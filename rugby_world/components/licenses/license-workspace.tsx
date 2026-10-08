"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader, StatusBadge } from "@/components/shared/page-header";
import { FederationTree } from "@/components/licenses/federation-tree";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/lib/format";
import { TMS_MODULES, licenseDaysLeft, licenseWatch } from "@/lib/licenses";
import { cn } from "@/lib/utils";
import type { LicenseContact, TmsModule } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

type Tab = "overview" | "details" | "modules" | "tournaments" | "federation";

export function LicenseWorkspace({ licenseId }: { licenseId: string }) {
  const { state, updateLicense, createCompetition } = useStore();
  const router = useRouter();
  const license = state.licenses.find((row) => row.id === licenseId);
  const union = state.unions.find((row) => row.id === license?.unionId);
  const [tab, setTab] = useState<Tab>("overview");
  const [modules, setModules] = useState<TmsModule[]>(license?.modules ?? []);
  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [startDate, setStartDate] = useState("2026-10-01");
  const [endDate, setEndDate] = useState("2026-11-15");
  const [startsAt, setStartsAt] = useState(license?.startsAt?.slice(0, 10) ?? "2026-01-01");
  const [endsAt, setEndsAt] = useState(license?.endsAt?.slice(0, 10) ?? "2026-12-31");
  const [seats, setSeats] = useState(String(license?.seats ?? 20));
  const [autoRenew, setAutoRenew] = useState(license?.autoRenew ?? false);
  const [noticeDays, setNoticeDays] = useState(String(license?.renewalNoticeDays ?? 90));
  const [maxTournaments, setMaxTournaments] = useState(String(license?.maxTournaments ?? 0));
  const [supportHours, setSupportHours] = useState(license?.supportHours ?? "");
  const [invoiceRef, setInvoiceRef] = useState(license?.invoiceRef ?? "");
  const [billingEmail, setBillingEmail] = useState(license?.billingEmail ?? "");
  const [officePhone, setOfficePhone] = useState(license?.officePhone ?? "");
  const [officeAddress, setOfficeAddress] = useState(license?.officeAddress ?? "");
  const [notes, setNotes] = useState(license?.notes ?? "");
  const [people, setPeople] = useState<LicenseContact[]>(
    license?.contacts?.length
      ? license.contacts
      : [{ name: license?.contactName ?? "", role: license?.contactRole ?? "", email: license?.contactEmail ?? "", phone: license?.contactPhone ?? "" }]
  );

  const tournaments = useMemo(
    () => state.competitions.filter((row) => row.licenseId === licenseId).sort((a, b) => b.startDate.localeCompare(a.startDate)),
    [state.competitions, licenseId]
  );
  const matches = useMemo(() => {
    const ids = new Set(tournaments.map((row) => row.id));
    return state.matches.filter((row) => ids.has(row.competitionId));
  }, [state.matches, tournaments]);

  if (!license || !union) return <p className="text-sm text-muted-foreground">Licence not found.</p>;
  const current = license;
  const member = union;

  const live = current.status === "active";
  const watch = licenseWatch(current);
  const daysLeft = licenseDaysLeft(current.endsAt);
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "details", label: "Details" },
    { id: "modules", label: `Modules (${current.modules.length})` },
    { id: "tournaments", label: `Tournaments (${tournaments.length})` },
    { id: "federation", label: "Federation" },
  ];

  function toggleModule(id: TmsModule) {
    setModules((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  function onSaveModules(e: FormEvent) {
    e.preventDefault();
    if (modules.length === 0) {
      toast.error("Pick at least one module.");
      return;
    }
    updateLicense(current.id, { modules });
    toast.success("Module pack saved.");
  }

  function onSaveDetails(e: FormEvent) {
    e.preventDefault();
    const contacts = people
      .map((row) => ({
        name: row.name.trim(),
        role: row.role.trim(),
        email: row.email.trim(),
        phone: row.phone?.trim() || undefined,
      }))
      .filter((row) => row.name || row.email);
    const primary = contacts[0];
    updateLicense(current.id, {
      startsAt,
      endsAt,
      seats: Number(seats) || current.seats,
      autoRenew,
      renewalNoticeDays: Number(noticeDays) || 90,
      maxTournaments: Number(maxTournaments) || 0,
      supportHours: supportHours.trim() || undefined,
      invoiceRef: invoiceRef.trim() || undefined,
      billingEmail: billingEmail.trim() || undefined,
      officePhone: officePhone.trim() || undefined,
      officeAddress: officeAddress.trim() || undefined,
      notes: notes.trim() || undefined,
      contacts,
      contactName: primary?.name || current.contactName,
      contactRole: primary?.role,
      contactEmail: primary?.email,
      contactPhone: primary?.phone,
    });
    toast.success("Licence details saved.");
  }

  function patchPerson(index: number, patch: Partial<LicenseContact>) {
    setPeople((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  }

  function onCreateEvent(e: FormEvent) {
    e.preventDefault();
    if (!name.trim() || !shortName.trim()) {
      toast.error("Name and short name are required.");
      return;
    }
    const id = createCompetition({
      name: name.trim(),
      shortName: shortName.trim(),
      season: "2026",
      location: member.country,
      startDate,
      endDate,
      description: `Organised by ${member.name} on licence ${current.licenseKey}.`,
      status: "upcoming",
      format: "15s",
      hostCountry: member.country,
      hostUnion: member.name,
      organiser: member.name,
      hostCities: member.hq,
      structure: "Round robin",
      lawNotes: "World Rugby Laws of the Game. Delivered on a member TMS licence.",
      broadcaster: "Union production",
      licenseId: current.id,
      ownerUnionId: member.id,
    });
    toast.success("Tournament opened for this licence.");
    setName("");
    setShortName("");
    router.push(`/tournaments/${id}/roster`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="TMS licence"
        title={`${member.flag} ${member.name}`}
        description={`${current.licenseKey} · ${member.hq}`}
        back={{ href: "/licenses", label: "Back to licences" }}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge status={watch === "ok" ? current.status : watch} />
            {live ? (
              <Button type="button" variant="outline" onClick={() => { updateLicense(current.id, { status: "suspended" }); toast.success("Licence suspended."); }}>
                Suspend
              </Button>
            ) : current.status === "suspended" ? (
              <Button type="button" variant="brand" onClick={() => { updateLicense(current.id, { status: "active" }); toast.success("Licence restored."); }}>
                Restore
              </Button>
            ) : (
              <Button
                type="button"
                variant="brand"
                onClick={() => {
                  updateLicense(current.id, { status: "active", startsAt: "2026-01-01", endsAt: "2026-12-31" });
                  toast.success("Licence renewed through 2026.");
                }}
              >
                Renew
              </Button>
            )}
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

      {tab === "overview" && (
        <div className="space-y-4">
          {watch !== "ok" && (
            <div className={cn("rounded-xl border px-4 py-3", watch === "expired" ? "border-red-200 bg-red-50" : "border-amber-200 bg-amber-50")}>
              <p className="font-medium text-navy">
                {watch === "expired"
                  ? `This licence ended ${formatDate(current.endsAt)}.`
                  : `Renewal window. ${daysLeft} days left, ends ${formatDate(current.endsAt)}.`}
              </p>
              <p className="text-sm text-muted-foreground">
                Notice is {current.renewalNoticeDays ?? 90} days. {current.autoRenew ? "Auto-renew is on." : "Auto-renew is off. HQ must renew."}
              </p>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Licence ID</p>
            <p className="mt-2 font-mono text-sm text-navy">{current.licenseKey}</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Term</p>
            <p className="mt-2 text-sm text-navy">
              {formatDate(current.startsAt)} - {formatDate(current.endsAt)}
            </p>
            <p className="text-xs text-muted-foreground">
              {daysLeft < 0 ? `${Math.abs(daysLeft)} days overdue` : `${daysLeft} days left`}
              {current.autoRenew ? " · auto-renew" : ""}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Seats</p>
            <p className="mt-2 font-heading text-2xl text-navy">
              {current.seatsUsed}/{current.seats}
            </p>
            <p className="text-xs text-muted-foreground">Union staff logged in</p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Last seen</p>
            <p className="mt-2 text-sm text-navy">{current.lastSeenAt ? formatDate(current.lastSeenAt) : "Never"}</p>
            <p className="text-xs text-muted-foreground">{current.supportHours || "Support hours not set"}</p>
          </div>
          <div className="rounded-xl border bg-card p-4 sm:col-span-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Primary contact</p>
            <p className="mt-2 font-medium text-navy">{current.contactName}</p>
            <p className="text-sm text-muted-foreground">{current.contactRole}</p>
            {current.contactEmail ? (
              <a href={`mailto:${current.contactEmail}`} className="block text-sm text-navy hover:underline">
                {current.contactEmail}
              </a>
            ) : null}
            {current.contactPhone ? (
              <a href={`tel:${current.contactPhone}`} className="block text-sm text-navy hover:underline">
                {current.contactPhone}
              </a>
            ) : null}
          </div>
          <div className="rounded-xl border bg-card p-4 sm:col-span-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Office</p>
            <p className="mt-2 text-sm text-navy">{current.officeAddress || member.hq}</p>
            {current.officePhone ? (
              <a href={`tel:${current.officePhone}`} className="block text-sm text-navy hover:underline">
                {current.officePhone}
              </a>
            ) : null}
            {current.billingEmail ? (
              <a href={`mailto:${current.billingEmail}`} className="block text-sm text-navy hover:underline">
                Billing {current.billingEmail}
              </a>
            ) : null}
            {current.invoiceRef ? <p className="text-xs text-muted-foreground">{current.invoiceRef}</p> : null}
          </div>
          <div className="rounded-xl border bg-card p-4 sm:col-span-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Member association</p>
            <Link href={`/members/${member.id}`} className="mt-2 inline-block font-medium text-navy hover:underline">
              {member.name}
            </Link>
            <p className="text-sm text-muted-foreground">
              {member.region} · {member.membership}
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4 sm:col-span-2">
            <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Notes</p>
            <p className="mt-2 text-sm text-navy">{current.notes || "No HQ notes."}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              Issued {formatDate(current.issuedAt)}
              {current.maxTournaments ? ` · cap ${current.maxTournaments} events` : " · no event cap"}
            </p>
          </div>
          </div>
          {(current.contacts?.length ?? 0) > 1 && (
            <div className="rounded-xl border bg-card p-4">
              <p className="mb-3 text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Named contacts</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {current.contacts.map((person) => (
                  <div key={`${person.email}-${person.name}`} className="rounded-lg border px-3 py-2 text-sm">
                    <p className="font-medium text-navy">{person.name}</p>
                    <p className="text-xs text-muted-foreground">{person.role}</p>
                    {person.email ? (
                      <a href={`mailto:${person.email}`} className="block text-navy hover:underline">
                        {person.email}
                      </a>
                    ) : null}
                    {person.phone ? (
                      <a href={`tel:${person.phone}`} className="block text-navy hover:underline">
                        {person.phone}
                      </a>
                    ) : null}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "details" && (
        <form onSubmit={onSaveDetails} className="max-w-3xl space-y-6">
          <section className="space-y-4 rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">Term and commercial</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="lic-start">Starts</Label>
                <Input id="lic-start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lic-end">Ends</Label>
                <Input id="lic-end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lic-seats">Staff seats</Label>
                <Input id="lic-seats" type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lic-notice">Renewal notice (days)</Label>
                <Input id="lic-notice" type="number" min="14" value={noticeDays} onChange={(e) => setNoticeDays(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lic-max">Max tournaments (0 = no cap)</Label>
                <Input id="lic-max" type="number" min="0" value={maxTournaments} onChange={(e) => setMaxTournaments(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lic-inv">Invoice reference</Label>
                <Input id="lic-inv" value={invoiceRef} onChange={(e) => setInvoiceRef(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="lic-hours">Support hours</Label>
                <Input id="lic-hours" value={supportHours} onChange={(e) => setSupportHours(e.target.value)} placeholder="Mon-Fri 08:00-18:00" />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              Auto-renew at the end of the term
            </label>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">Office and billing</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="lic-bill">Billing email</Label>
                <Input id="lic-bill" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="lic-sw">Switchboard</Label>
                <Input id="lic-sw" value={officePhone} onChange={(e) => setOfficePhone(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="lic-addr">Office address</Label>
                <Input id="lic-addr" value={officeAddress} onChange={(e) => setOfficeAddress(e.target.value)} />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="lic-notes">HQ notes</Label>
                <Textarea id="lic-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
              </div>
            </div>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold text-navy">Contacts</h2>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => setPeople((rows) => [...rows, { name: "", role: "", email: "", phone: "" }])}
              >
                Add contact
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">First person is the primary contact for expiry notices.</p>
            <div className="space-y-4">
              {people.map((person, index) => (
                <div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={person.name} onChange={(e) => patchPerson(index, { name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Role</Label>
                    <Input value={person.role} onChange={(e) => patchPerson(index, { role: e.target.value })} />
                  </div>
                  <div>
                    <Label>Email</Label>
                    <Input type="email" value={person.email} onChange={(e) => patchPerson(index, { email: e.target.value })} />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input value={person.phone ?? ""} onChange={(e) => patchPerson(index, { phone: e.target.value })} />
                  </div>
                  {people.length > 1 && (
                    <div className="sm:col-span-2">
                      <Button type="button" size="sm" variant="ghost" onClick={() => setPeople((rows) => rows.filter((_, i) => i !== index))}>
                        Remove
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
          <Button type="submit" variant="brand">
            Save details
          </Button>
        </form>
      )}

      {tab === "modules" && (
        <form onSubmit={onSaveModules} className="max-w-3xl rounded-xl border bg-card p-4">
          <h2 className="font-heading text-lg font-semibold text-navy">What they can run</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Only these Tournament Management modules appear in the union workspace.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {TMS_MODULES.map((row) => {
              const on = modules.includes(row.id);
              return (
                <label key={row.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3", on && "border-navy bg-navy/5")}>
                  <input type="checkbox" className="mt-1" checked={on} onChange={() => toggleModule(row.id)} />
                  <span>
                    <span className="block font-medium text-navy">{row.label}</span>
                    <span className="text-xs text-muted-foreground">{row.hint}</span>
                  </span>
                </label>
              );
            })}
          </div>
          <Button type="submit" variant="brand" className="mt-4">
            Save modules
          </Button>
        </form>
      )}

      {tab === "tournaments" && (
        <div className="space-y-6">
          <section className="rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">Tournaments they are running</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              {matches.filter((row) => row.status === "live").length} live now · {tournaments.length} events on this licence.
            </p>
            {tournaments.length === 0 ? (
              <p className="text-sm text-muted-foreground">None yet. Create one below.</p>
            ) : (
              <div className="overflow-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-muted/90 text-left text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Event</th>
                      <th className="px-3 py-2">Dates</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Fixtures</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tournaments.map((row) => {
                      const count = state.matches.filter((item) => item.competitionId === row.id).length;
                      return (
                        <tr key={row.id} className="border-t">
                          <td className="px-3 py-2">
                            <Link href={`/tournaments/${row.id}`} className="font-medium text-navy hover:underline">
                              {row.name}
                            </Link>
                            <p className="text-xs text-muted-foreground">{row.structure}</p>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">
                            {formatDate(row.startDate)} - {formatDate(row.endDate)}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge status={row.status} />
                          </td>
                          <td className="px-3 py-2 tabular-nums">{count || row.matches}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {matches.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Recent fixtures</p>
                {matches
                  .slice()
                  .sort((a, b) => b.kickoff.localeCompare(a.kickoff))
                  .slice(0, 6)
                  .map((row) => (
                    <Link
                      key={row.id}
                      href={`/tournaments/matches/${row.id}`}
                      className="flex items-center justify-between rounded-lg border px-3 py-2 text-sm hover:bg-muted/60"
                    >
                      <span>
                        {row.homeTeam} {row.homeScore != null && row.awayScore != null ? `${row.homeScore}-${row.awayScore}` : "v"} {row.awayTeam}
                        <span className="ml-2 text-xs text-muted-foreground">{row.round}</span>
                      </span>
                      <StatusBadge status={row.status} />
                    </Link>
                  ))}
              </div>
            )}
          </section>
          <form onSubmit={onCreateEvent} className="rounded-xl border bg-card p-4">
            <h2 className="font-heading text-lg font-semibold text-navy">Log a union tournament</h2>
            <p className="mb-4 text-sm text-muted-foreground">Creates the event under this licence so HQ can monitor it.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Label htmlFor="ev-name">Official name</Label>
                <Input id="ev-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="National Club Cup 2027" />
              </div>
              <div>
                <Label htmlFor="ev-short">Short name</Label>
                <Input id="ev-short" value={shortName} onChange={(e) => setShortName(e.target.value)} placeholder="Club Cup" />
              </div>
              <div>
                <Label htmlFor="ev-start">Start</Label>
                <Input id="ev-start" type="date" className={field} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="ev-end">End</Label>
                <Input id="ev-end" type="date" className={field} value={endDate} onChange={(e) => setEndDate(e.target.value)} />
              </div>
            </div>
            <Button type="submit" variant="brand" className="mt-4">
              Create tournament
            </Button>
          </form>
        </div>
      )}

      {tab === "federation" && <FederationTree unionId={member.id} />}
    </div>
  );
}
