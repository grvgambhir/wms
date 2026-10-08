"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, ChevronRight, Globe2, Landmark, MapPinned } from "lucide-react";
import { useStore } from "@/lib/store";
import { treeForUnion } from "@/lib/licenses";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { FederationNode, MemberUnion } from "@/lib/types";

const CONTINENTS = ["Africa", "Asia", "Europe", "North America", "Oceania", "South America"];

type Kind = "root" | "continent" | "union" | "region" | "club";

type TreeItem = {
  id: string;
  kind: Kind;
  label: string;
  sub?: string;
  href?: string;
  meta?: string;
  children: TreeItem[];
};

function nodeToItems(nodes: FederationNode[], parentId: string | null): TreeItem[] {
  return nodes
    .filter((row) => row.parentId === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((row) => {
      const children = nodeToItems(nodes, row.id);
      return {
        id: row.id,
        kind: row.kind,
        label: row.name,
        sub: row.city,
        meta:
          row.kind === "club"
            ? `${row.teams ?? 0} teams${row.players != null ? ` · ${playerLabel(row.players)}` : ""}`
            : row.kind === "region"
              ? `${children.length} ${children.length === 1 ? "club" : "clubs"}`
              : undefined,
        children,
      };
    });
}

function playerLabel(n: number) {
  return `${n} players`;
}

function clubCount(item: TreeItem): number {
  if (item.kind === "club") return 1;
  return item.children.reduce((sum, child) => sum + clubCount(child), 0);
}

function matchesQuery(item: TreeItem, q: string): boolean {
  if (!q) return false;
  if (`${item.label} ${item.sub ?? ""}`.toLowerCase().includes(q)) return true;
  return item.children.some((child) => matchesQuery(child, q));
}

function collectOpenIds(item: TreeItem, q: string, into: Record<string, boolean>) {
  const hit = !q || matchesQuery(item, q);
  if (item.children.length && (q ? hit : item.kind === "continent" || item.kind === "root")) {
    into[item.id] = true;
  }
  if (q && hit) {
    into[item.id] = item.children.length > 0;
    for (const child of item.children) collectOpenIds(child, q, into);
  } else if (!q && (item.kind === "continent" || item.kind === "root")) {
    into[item.id] = true;
    for (const child of item.children) collectOpenIds(child, q, into);
  }
}

function unionBranch(union: MemberUnion, nodes: FederationNode[], licenseKey?: string): TreeItem {
  const local = nodes.filter((row) => row.unionId === union.id);
  const children = nodeToItems(local, null);
  const clubs = local.filter((row) => row.kind === "club").length;
  return {
    id: `union-${union.id}`,
    kind: "union",
    label: `${union.flag} ${union.name}`,
    sub: union.abbreviation,
    href: `/members/${union.id}`,
    meta: clubs ? `${clubs} clubs${licenseKey ? ` · licensed` : ""}` : "No clubs registered",
    children,
  };
}

function KindMark({ kind }: { kind: Kind }) {
  const className = "size-3.5 shrink-0";
  if (kind === "root") return <Globe2 className={className} />;
  if (kind === "continent") return <MapPinned className={className} />;
  if (kind === "union") return <Landmark className={className} />;
  if (kind === "region") return <MapPinned className={className} />;
  return <Building2 className={className} />;
}

function TreeRow({
  item,
  depth,
  isLast,
  open,
  onToggle,
  query,
}: {
  item: TreeItem;
  depth: number;
  isLast: boolean;
  open: Record<string, boolean>;
  onToggle: (id: string) => void;
  query: string;
}) {
  const hasKids = item.children.length > 0;
  const expanded = hasKids && (open[item.id] ?? false);
  const q = query.trim().toLowerCase();
  const selfHit = q && `${item.label} ${item.sub ?? ""}`.toLowerCase().includes(q);
  const title = (
    <span className="min-w-0">
      <span className="font-medium text-navy">{item.label}</span>
      {item.sub ? <span className="ml-2 text-xs text-muted-foreground">{item.sub}</span> : null}
    </span>
  );

  return (
    <li className="relative">
      {depth > 0 && (
        <>
          <span className={cn("absolute top-0 left-3 w-px bg-navy/15", isLast ? "h-5" : "bottom-0")} />
          <span className="absolute top-5 left-3 h-px w-3 bg-navy/15" />
        </>
      )}
      <div
        className={cn(
          "relative mb-1.5 flex items-center gap-2 rounded-xl border px-2.5 py-2",
          depth > 0 && "ml-6",
          item.kind === "union" && "bg-white shadow-sm",
          item.kind === "continent" && "border-transparent bg-navy/5",
          item.kind === "region" && "bg-muted/40",
          item.kind === "club" && "border-dashed bg-white",
          selfHit && "border-gold bg-gold/10"
        )}
      >
        {hasKids ? (
          <button
            type="button"
            onClick={() => onToggle(item.id)}
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-navy hover:bg-muted"
            aria-label={expanded ? "Collapse" : "Expand"}
          >
            <ChevronRight className={cn("size-4 transition-transform", expanded && "rotate-90")} />
          </button>
        ) : (
          <span className="flex size-6 shrink-0 items-center justify-center text-muted-foreground">
            <KindMark kind={item.kind} />
          </span>
        )}
        {hasKids && (
          <span className="hidden text-navy sm:flex">
            <KindMark kind={item.kind} />
          </span>
        )}
        <button
          type="button"
          className="min-w-0 flex-1 text-left"
          onClick={() => hasKids && onToggle(item.id)}
        >
          {title}
        </button>
        {item.href && (
          <Link href={item.href} className="shrink-0 text-[11px] font-medium text-navy hover:underline">
            Open
          </Link>
        )}
        {item.meta && <span className="shrink-0 text-[11px] text-muted-foreground">{item.meta}</span>}
      </div>
      {expanded && (
        <ul className="relative">
          {item.children.map((child, index) => (
            <TreeRow
              key={child.id}
              item={child}
              depth={depth + 1}
              isLast={index === item.children.length - 1}
              open={open}
              onToggle={onToggle}
              query={query}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export function FederationHierarchy({ unionId }: { unionId?: string }) {
  const { state } = useStore();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<Record<string, boolean>>({ root: true });

  const tree = useMemo<TreeItem>(() => {
    if (unionId) {
      const union = state.unions.find((row) => row.id === unionId);
      if (!union) {
        return { id: "root", kind: "root", label: "World Rugby", children: [] };
      }
      const license = state.licenses.find((row) => row.unionId === union.id);
      return unionBranch(union, state.federationNodes, license?.licenseKey);
    }
    const continents: TreeItem[] = CONTINENTS.map((continent) => {
      const unions = state.unions
        .filter((row) => row.region === continent)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((union) => {
          const license = state.licenses.find((row) => row.unionId === union.id);
          return unionBranch(union, state.federationNodes, license?.licenseKey);
        });
      const clubs = unions.reduce((sum, row) => sum + clubCount(row), 0);
      return {
        id: `continent-${continent}`,
        kind: "continent" as const,
        label: continent,
        meta: `${unions.length} unions · ${clubs} clubs`,
        children: unions,
      };
    }).filter((row) => row.children.length > 0);
    const clubs = continents.reduce((sum, row) => sum + clubCount(row), 0);
    return {
      id: "root",
      kind: "root",
      label: "World Rugby",
      sub: "Member network",
      meta: `${state.unions.length} unions · ${clubs} registered clubs`,
      children: continents,
    };
  }, [state.unions, state.federationNodes, state.licenses, unionId]);

  const q = query.trim().toLowerCase();
  const derivedOpen = useMemo(() => {
    const auto: Record<string, boolean> = { root: true };
    collectOpenIds(tree, q, auto);
    if (unionId) {
      auto[tree.id] = true;
      if (!q) {
        for (const child of tree.children) {
          if (child.kind === "region" && child.children.length) auto[child.id] = true;
        }
      }
    }
    const merged: Record<string, boolean> = q ? { ...open, ...auto } : { ...auto, ...open, root: true };
    return merged;
  }, [tree, q, open, unionId]);

  function toggle(id: string) {
    setOpen((current) => ({ ...current, [id]: !(derivedOpen[id] ?? false) }));
  }

  function expandAll() {
    const next: Record<string, boolean> = { root: true };
    const walk = (item: TreeItem) => {
      if (item.children.length) next[item.id] = true;
      item.children.forEach(walk);
    };
    walk(tree);
    setOpen(next);
  }

  function collapseClubs() {
    const next: Record<string, boolean> = { root: true };
    for (const continent of tree.children) {
      next[continent.id] = true;
    }
    if (unionId) next[tree.id] = true;
    setOpen(next);
  }

  const { list } = unionId ? treeForUnion(state.federationNodes, unionId) : { list: state.federationNodes };
  const clubs = list.filter((row) => row.kind === "club").length;

  return (
    <section className="overflow-hidden rounded-2xl border bg-card">
      <div className="wr-gradient px-5 py-4 text-white">
        <p className="text-[11px] font-semibold tracking-[0.2em] text-gold uppercase">
          {unionId ? "Federation structure" : "World Rugby network"}
        </p>
        <h2 className="mt-1 font-heading text-2xl font-semibold">
          {unionId ? tree.label : "Hierarchy of member associations"}
        </h2>
        <p className="mt-1 text-sm text-white/75">
          {unionId
            ? `${clubs} clubs registered under this union, with regions and provinces above them.`
            : "World Rugby, then continent, then the member association, then the clubs they have registered."}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-4 py-3">
        <Input
          className="max-w-sm bg-white"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={unionId ? "Search clubs" : "Search unions or clubs"}
        />
        <Button type="button" size="sm" variant="outline" onClick={expandAll}>
          Expand all
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={collapseClubs}>
          Unions only
        </Button>
      </div>
      <ul className="p-4">
        {tree.children.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clubs registered yet.</p>
        ) : (
          tree.children.map((child, index) => (
            <TreeRow
              key={child.id}
              item={child}
              depth={0}
              isLast={index === tree.children.length - 1}
              open={derivedOpen}
              onToggle={toggle}
              query={query}
            />
          ))
        )}
      </ul>
    </section>
  );
}
