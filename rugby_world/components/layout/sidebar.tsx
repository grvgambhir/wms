"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  HeartPulse,
  KeyRound,
  LayoutDashboard,
  ListOrdered,
  Newspaper,
  Settings,
  Trophy,
  Users,
} from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/utils";

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/tournaments", label: "Tournament Management", icon: Trophy },
  { href: "/concussion", label: "Concussion Management", icon: HeartPulse },
  { href: "/cms", label: "Website Admin / CMS", icon: Newspaper },
  { href: "/members", label: "Member Associations", icon: Users },
  { href: "/licenses", label: "TMS Licences", icon: KeyRound },
  { href: "/rankings", label: "World Rugby Rankings", icon: ListOrdered },
  { href: "/education", label: "Education & Courses", icon: GraduationCap },
];

export function Sidebar({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  const pathname = usePathname();

  return (
    <aside
      className={cn(
        "wr-gradient relative flex h-full min-h-0 shrink-0 flex-col bg-navy text-white transition-[width] duration-200",
        collapsed ? "w-[76px]" : "w-[272px]"
      )}
    >
      <div
        className={cn(
          "flex items-center bg-white",
          collapsed ? "h-16 justify-center px-2" : "px-4 py-4"
        )}
      >
        <Link href="/dashboard" className="flex min-w-0 items-center">
          <Logo compact={collapsed} />
        </Link>
      </div>
      <button
        type="button"
        onClick={onToggle}
        aria-label={collapsed ? "Expand menu" : "Collapse menu"}
        className="absolute top-8 right-0 z-20 flex size-7 -translate-y-1/2 translate-x-1/2 items-center justify-center rounded-full border border-neutral-200 bg-white text-navy shadow-sm hover:bg-neutral-50"
      >
        {collapsed ? (
          <ChevronRight className="size-4" strokeWidth={2} />
        ) : (
          <ChevronLeft className="size-4" strokeWidth={2} />
        )}
      </button>
      <nav className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2 pt-3">
        {NAV_ITEMS.map((item) => {
          const active =
            pathname === item.href || pathname.startsWith(`${item.href}/`);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={cn(
                "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-white/20 text-white"
                  : "text-white/80 hover:bg-white/10 hover:text-white",
                collapsed && "justify-center px-0"
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {!collapsed && (
                <span className="truncate font-medium">{item.label}</span>
              )}
            </Link>
          );
        })}
      </nav>
      <div className="p-2 pb-4">
        <Link
          href="/settings"
          className={cn(
            "flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white",
            pathname.startsWith("/settings") && "bg-white/20 text-white",
            collapsed && "justify-center px-0"
          )}
        >
          <Settings className="size-4" />
          {!collapsed && <span className="font-medium">Settings</span>}
        </Link>
      </div>
    </aside>
  );
}
