"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bell, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useStore } from "@/lib/store";
import { formatDateTime } from "@/lib/format";
import { usePlayerStats } from "@/components/players/player-stats";

export function Topbar() {
  const router = useRouter();
  const { openPlayer } = usePlayerStats();
  const { session, state, logout, markNotificationRead, markAllNotificationsRead } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const unread = state.notifications.filter((n) => !n.read).length;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q.length < 2) return [];
    const items: { href?: string; playerId?: string; label: string; group: string }[] = [];
    for (const c of state.competitions) {
      if (c.name.toLowerCase().includes(q)) items.push({ href: `/tournaments/${c.id}`, label: c.name, group: "Tournaments" });
    }
    for (const t of state.teams) {
      if (t.name.toLowerCase().includes(q))
        items.push({ href: `/tournaments/teams/${t.id}`, label: t.name, group: "Teams" });
    }
    for (const p of state.players) {
      if (p.name.toLowerCase().includes(q))
        items.push({ playerId: p.id, label: p.name, group: "Players" });
    }
    for (const m of state.matches) {
      const label = `${m.homeTeam} v ${m.awayTeam}`;
      if (label.toLowerCase().includes(q)) items.push({ href: `/tournaments/matches/${m.id}`, label, group: "Matches" });
    }
    for (const u of state.unions) {
      if (`${u.name} ${u.country}`.toLowerCase().includes(q))
        items.push({ href: `/members/${u.id}`, label: u.name, group: "Unions" });
    }
    for (const c of state.cases) {
      if (c.player.toLowerCase().includes(q))
        items.push({ href: `/concussion/${c.id}`, label: c.player, group: "Medical" });
    }
    for (const a of state.articles) {
      if (a.title.toLowerCase().includes(q))
        items.push({ href: `/cms/news/${a.id}`, label: a.title, group: "CMS" });
    }
    for (const license of state.licenses) {
      const union = state.unions.find((item) => item.id === license.unionId);
      if (`${license.licenseKey} ${union?.name ?? ""}`.toLowerCase().includes(q))
        items.push({ href: `/licenses/${license.id}`, label: `${union?.name ?? "Union"} · ${license.licenseKey}`, group: "Licences" });
    }
    for (const node of state.federationNodes) {
      if (node.name.toLowerCase().includes(q)) {
        const license = state.licenses.find((item) => item.unionId === node.unionId);
        items.push({
          href: license ? `/licenses/${license.id}` : `/members/${node.unionId}`,
          label: node.name,
          group: node.kind === "club" ? "Clubs" : "Regions",
        });
      }
    }
    return items.slice(0, 12);
  }, [query, state]);

  return (
    <header className="flex h-16 items-center justify-between gap-4 border-b border-border bg-white px-4 lg:px-6">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex max-w-xl flex-1 items-center gap-2 rounded-lg border border-border bg-muted/60 px-3 py-2 text-left text-sm text-muted-foreground hover:bg-muted"
      >
        <Search className="size-4" />
        <span className="hidden sm:inline">Search tournaments, unions, players, articles…</span>
        <span className="sm:hidden">Search</span>
      </button>
      <div className="flex items-center gap-2">
        <DropdownMenu>
          <DropdownMenuTrigger className="relative inline-flex size-8 items-center justify-center rounded-lg hover:bg-muted">
            <Bell className="size-4" />
            {unread > 0 && (
              <span className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-red-600 text-[9px] font-bold text-white">
                {unread}
              </span>
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-80">
            <div className="flex items-center justify-between px-2 py-1.5">
              <p className="text-xs font-semibold tracking-wide uppercase">Notifications</p>
              <button
                type="button"
                className="text-xs text-navy hover:underline"
                onClick={markAllNotificationsRead}
              >
                Mark all read
              </button>
            </div>
            <DropdownMenuSeparator />
            {state.notifications.slice(0, 6).map((n) => (
              <DropdownMenuItem
                key={n.id}
                className="flex flex-col items-start gap-0.5"
                onClick={() => {
                  markNotificationRead(n.id);
                  router.push(n.href);
                }}
              >
                <span className="text-sm font-medium">
                  {!n.read && <span className="mr-1 inline-block size-1.5 rounded-full bg-gold" />}
                  {n.title}
                </span>
                <span className="text-xs text-muted-foreground">{n.body}</span>
                <span className="text-[10px] text-muted-foreground">{formatDateTime(n.at)}</span>
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger className="inline-flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-muted">
            <Avatar className="size-8">
              <AvatarFallback className="bg-navy text-xs text-white">AM</AvatarFallback>
            </Avatar>
            <span className="hidden text-left sm:block">
              <span className="block text-sm font-medium text-navy">{session?.name}</span>
              <span className="block text-[11px] text-muted-foreground">{session?.role}</span>
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => router.push("/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => {
                logout();
                router.push("/login");
              }}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Search HQ</DialogTitle>
          </DialogHeader>
          <Input
            autoFocus
            placeholder="Type at least 2 characters"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="max-h-72 overflow-auto">
            {results.length === 0 && query.length >= 2 && (
              <p className="p-3 text-sm text-muted-foreground">No matches.</p>
            )}
            {results.map((r) =>
              r.playerId ? (
                <button
                  key={`${r.playerId}-${r.label}`}
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    openPlayer(r.playerId as string);
                  }}
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-muted"
                >
                  <span>{r.label}</span>
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{r.group}</span>
                </button>
              ) : (
                <Link
                  key={`${r.href}-${r.label}`}
                  href={r.href ?? "/"}
                  onClick={() => setOpen(false)}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm hover:bg-muted"
                >
                  <span>{r.label}</span>
                  <span className="text-[11px] tracking-wide text-muted-foreground uppercase">{r.group}</span>
                </Link>
              )
            )}
          </div>
        </DialogContent>
      </Dialog>
    </header>
  );
}
