"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { useStore } from "@/lib/store";
import { PageHeader } from "@/components/shared/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CORE_TMS_MODULES, FULL_TMS_MODULES, TMS_MODULES, nextLicenseKey } from "@/lib/licenses";
import { cn } from "@/lib/utils";
import type { TmsModule } from "@/lib/types";

const field = "h-10 w-full rounded-lg border border-input bg-white px-2.5 text-sm";

export default function NewLicensePage() {
  const router = useRouter();
  const { state, createLicense } = useStore();
  const licensed = useMemo(
    () => new Set(state.licenses.filter((row) => row.status === "active" || row.status === "draft").map((row) => row.unionId)),
    [state.licenses]
  );
  const available = state.unions.filter((row) => !licensed.has(row.id)).sort((a, b) => a.name.localeCompare(b.name));
  const [unionId, setUnionId] = useState(available[0]?.id ?? "");
  const [modules, setModules] = useState<TmsModule[]>(CORE_TMS_MODULES);
  const [startsAt, setStartsAt] = useState("2026-01-01");
  const [endsAt, setEndsAt] = useState("2026-12-31");
  const [seats, setSeats] = useState("20");
  const [contactName, setContactName] = useState("");
  const [contactRole, setContactRole] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [billingEmail, setBillingEmail] = useState("");
  const [officePhone, setOfficePhone] = useState("");
  const [officeAddress, setOfficeAddress] = useState("");
  const [autoRenew, setAutoRenew] = useState(false);
  const [notes, setNotes] = useState("");

  const union = state.unions.find((row) => row.id === unionId);
  const previewKey = union ? nextLicenseKey(union.abbreviation, state.licenses) : "WR-TMS-…";

  function toggle(id: TmsModule) {
    setModules((current) => (current.includes(id) ? current.filter((row) => row !== id) : [...current, id]));
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!unionId) {
      toast.error("Pick a member association.");
      return;
    }
    if (modules.length === 0) {
      toast.error("Pick at least one module.");
      return;
    }
    const id = createLicense({
      unionId,
      modules,
      startsAt,
      endsAt,
      seats: Number(seats) || 20,
      contactName: contactName || union?.contacts[0]?.name || "",
      contactRole,
      contactEmail,
      contactPhone,
      billingEmail,
      officePhone,
      officeAddress,
      autoRenew,
      notes,
    });
    if (!id) {
      toast.error("Could not issue that licence.");
      return;
    }
    toast.success(`Licence ${previewKey} issued.`);
    router.push(`/licenses/${id}`);
  }

  return (
    <div>
      <PageHeader
        eyebrow="Licensing"
        title="Issue a TMS licence"
        description="Choose the union, generate a licence ID, and pick which Tournament Management modules they receive."
        back={{ href: "/licenses", label: "Back to licences" }}
      />
      {available.length === 0 ? (
        <p className="text-sm text-muted-foreground">Every member association already has an active licence.</p>
      ) : (
        <form onSubmit={onSubmit} className="max-w-3xl space-y-6">
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <h2 className="font-heading text-lg font-semibold text-navy">Member association</h2>
            <div>
              <Label>Union</Label>
              <select
                className={field}
                value={unionId}
                onChange={(e) => {
                  setUnionId(e.target.value);
                  const next = state.unions.find((row) => row.id === e.target.value);
                  setContactName(next?.contacts[0]?.name ?? "");
                  setContactRole(next?.contacts[0]?.role ?? "");
                  setContactEmail(next?.contacts[0]?.email ?? "");
                  setOfficeAddress(next?.hq ?? "");
                }}
              >
                {available.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.flag} {row.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border bg-muted/40 px-3 py-3">
              <p className="text-[11px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">Licence ID</p>
              <p className="mt-1 font-mono text-sm text-navy">{previewKey}</p>
              <p className="mt-1 text-xs text-muted-foreground">Created when you issue. Format WR-TMS-UNION-YEAR-0001.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="start">Starts</Label>
                <Input id="start" type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="end">Ends</Label>
                <Input id="end" type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="seats">Staff seats</Label>
                <Input id="seats" type="number" min="1" value={seats} onChange={(e) => setSeats(e.target.value)} />
              </div>
              <div>
                <Label htmlFor="contact">Primary contact</Label>
                <Input id="contact" value={contactName} onChange={(e) => setContactName(e.target.value)} placeholder={union?.contacts[0]?.name} />
              </div>
              <div>
                <Label htmlFor="role">Role</Label>
                <Input id="role" value={contactRole} onChange={(e) => setContactRole(e.target.value)} placeholder="Competitions manager" />
              </div>
              <div>
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder={union?.contacts[0]?.email} />
              </div>
              <div>
                <Label htmlFor="phone">Mobile / direct line</Label>
                <Input id="phone" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+44 20 0000 0000" />
              </div>
              <div>
                <Label htmlFor="billing">Billing email</Label>
                <Input id="billing" type="email" value={billingEmail} onChange={(e) => setBillingEmail(e.target.value)} placeholder="accounts@union.rugby" />
              </div>
              <div>
                <Label htmlFor="office">Switchboard</Label>
                <Input id="office" value={officePhone} onChange={(e) => setOfficePhone(e.target.value)} placeholder="+44 20 0000 0000" />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="address">Office address</Label>
                <Input id="address" value={officeAddress} onChange={(e) => setOfficeAddress(e.target.value)} placeholder={union?.hq} />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={autoRenew} onChange={(e) => setAutoRenew(e.target.checked)} />
              Auto-renew at the end of the term
            </label>
            <div>
              <Label htmlFor="notes">HQ notes</Label>
              <Textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </section>
          <section className="space-y-4 rounded-xl border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-heading text-lg font-semibold text-navy">Modules</h2>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => setModules(CORE_TMS_MODULES)}>
                  Core pack
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setModules(FULL_TMS_MODULES)}>
                  Full TMS
                </Button>
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {TMS_MODULES.map((row) => {
                const on = modules.includes(row.id);
                return (
                  <label key={row.id} className={cn("flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-3", on && "border-navy bg-navy/5")}>
                    <input type="checkbox" className="mt-1" checked={on} onChange={() => toggle(row.id)} />
                    <span>
                      <span className="block font-medium text-navy">{row.label}</span>
                      <span className="text-xs text-muted-foreground">{row.hint}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>
          <Button type="submit" variant="brand">
            Issue licence
          </Button>
        </form>
      )}
    </div>
  );
}
