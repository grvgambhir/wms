import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  BarChart3,
  Clock,
  RotateCcw,
  Rows3,
  Send,
  ShieldCheck,
  SlidersHorizontal,
  UserPlus,
  Users,
  Wallet,
  type LucideIcon,
  FileCheck2,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { sessionIsOcAdmin, useOptionalAuth } from "../../auth/AuthProvider";
import { AccountMenu } from "./AccountMenu";

interface NavItem {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly href?: string;
  readonly badge?: number;
}

interface NavSection {
  readonly id: string;
  readonly label: string;
  readonly items: readonly NavItem[];
}

const baseNavigation: readonly NavSection[] = [
  {
    id: "operations",
    label: "Operations",
    items: [
      {
        id: "system",
        label: "System & Load",
        icon: Activity,
        href: "/operations",
      },
      { id: "funnel", label: "Registration Funnel", icon: BarChart3 },
    ],
  },
  {
    id: "queues",
    label: "Work queues",
    items: [
      {
        id: "registrations",
        label: "Registrations",
        icon: Rows3,
        href: "/registrations",
      },
      {
        id: "evidence-review",
        label: "Evidence review",
        icon: FileCheck2,
        href: "/evidence-review",
      },
      {
        id: "roster-changes",
        label: "Team roster changes",
        icon: Users,
        href: "/roster-changes",
      },
      {
        id: "waitlist",
        label: "Waitlist",
        icon: Clock,
        href: "/waitlist",
      },
      {
        id: "exceptions",
        label: "Exceptions",
        icon: AlertTriangle,
        badge: 12,
        href: "/exceptions",
      },
      {
        id: "accreditation",
        label: "Accreditation Desk",
        icon: BadgeCheck,
        href: "/accreditation-desk",
      },
      {
        id: "assisted",
        label: "Assisted Registration",
        icon: UserPlus,
        href: "/assisted-registration",
      },
      {
        id: "finance",
        label: "Finance & Reconcile",
        icon: Wallet,
        href: "/finance",
      },
    ],
  },
  {
    id: "configuration",
    label: "Configuration",
    items: [
      {
        id: "rules",
        label: "Sport Rules Engine",
        icon: SlidersHorizontal,
        href: "/rules-configurator",
      },
      {
        id: "comms",
        label: "Communications",
        icon: Send,
        href: "/communications",
      },
    ],
  },
];

const administrationSection: NavSection = {
  id: "administration",
  label: "Administration",
  items: [
    { id: "people", label: "People & Roles", icon: Users, href: "/people" },
  ],
};

function navigationFor(isOcAdmin: boolean): readonly NavSection[] {
  return isOcAdmin
    ? [...baseNavigation, administrationSection]
    : baseNavigation;
}

interface AdminPortalShellProps {
  readonly children: ReactNode;
  readonly onResetDemo?: () => void;
  readonly resetDisabled?: boolean;
  readonly userName?: string;
  readonly role?: string;
}

function defaultRoleLabel(roles: readonly string[] | undefined): string {
  if (!roles || roles.length === 0) return "Superuser Role";
  if (roles.includes("oc_admin")) return "OC administrator";
  if (roles.includes("finance")) return "Finance";
  if (roles.includes("oc_staff")) return "OC staff";
  return "Superuser Role";
}

export function AdminPortalShell({
  children,
  onResetDemo,
  resetDisabled = false,
  userName,
  role,
}: AdminPortalShellProps) {
  const auth = useOptionalAuth();
  const me = auth?.session?.me;
  const isOcAdmin = sessionIsOcAdmin(auth?.session ?? null);
  const navigation = navigationFor(isOcAdmin);
  const nameFromProfile = [me?.givenName, me?.familyName]
    .filter(Boolean)
    .join(" ")
    .trim();
  const displayName =
    userName?.trim() ||
    nameFromProfile ||
    auth?.session?.username ||
    "Admin_System";
  const resolvedRole = role ?? defaultRoleLabel(me?.roles);

  return (
    <div className="flex h-screen min-h-[720px] overflow-hidden bg-background">
      <aside className="flex w-64 shrink-0 flex-col border-r border-white/[0.08] bg-admin-sidebar text-admin-copy">
        <div className="px-5 pb-[18px] pt-[22px]">
          <p className="text-base font-extrabold tracking-[0.025em] text-white">
            OC Command Centre
          </p>
          <p className="mt-1 text-xs text-admin-muted">Como Lake 2027</p>
        </div>

        <nav
          aria-label="Admin navigation"
          className="min-h-0 flex-1 overflow-y-auto pb-4"
        >
          {navigation.map((section) => (
            <div key={section.id} className="mt-2.5">
              <h2 className="mb-1.5 px-5 text-[11px] font-bold uppercase tracking-[0.11em] text-admin-muted">
                {section.label}
              </h2>
              <div className="space-y-0.5 px-2.5">
                {section.items.map((item) => (
                  <SidebarItem key={item.id} item={item} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="border-t border-white/[0.08] p-4">
          <div className="flex items-center gap-2 text-xs font-semibold text-admin-copy">
            <span aria-hidden className="h-2 w-2 rounded-full bg-success" />
            Live Production Env
          </div>
          <p className="mt-1 text-[11px] text-admin-muted">
            Last deployed: v1.0.4
          </p>
        </div>

        {onResetDemo ? (
          <button
            type="button"
            onClick={onResetDemo}
            disabled={resetDisabled}
            className="flex min-h-11 items-center gap-2 border-t border-white/[0.08] px-5 py-3 text-left text-xs font-semibold text-admin-muted transition hover:bg-white/5 hover:text-white disabled:cursor-wait disabled:opacity-60"
          >
            <RotateCcw aria-hidden size={14} />
            Reset demo
          </button>
        ) : null}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-[61px] shrink-0 items-center border-b border-border bg-surface px-5">
          <div className="flex-1" />
          <div
            className="flex items-center gap-1.5 rounded-full border border-danger/35 bg-danger/[0.08] px-3 py-1.5 text-xs font-bold tracking-[0.03em] text-danger"
            aria-label="Protected window active"
          >
            <ShieldCheck aria-hidden size={14} />
            PROTECTED WINDOW ACTIVE
          </div>
          <div
            className="ml-3 flex overflow-hidden rounded-md border border-border text-[11px] font-bold"
            aria-label="Language placeholder"
          >
            <button
              type="button"
              className="bg-admin-sidebar px-2.5 py-2 text-white"
              aria-pressed="true"
            >
              EN
            </button>
            <button
              type="button"
              className="px-2.5 py-2 text-text-muted"
              aria-pressed="false"
              title="Italian localization is not wired yet"
            >
              IT
            </button>
          </div>
          <AccountMenu
            userName={displayName}
            email={me?.email}
            role={resolvedRole}
            onSignOut={auth?.session ? () => void auth.signOut() : undefined}
          />
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6 pb-12">
          {auth?.session?.me?.mfa && !auth.session.me.mfa.enforcementActive ? (
            <div
              role="status"
              className="mb-4 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-text"
            >
              MFA is not yet enforced:{" "}
              {auth.session.me.mfa.enrolledOcAdminCount} of 2 OC administrators
              are enrolled. Until a second administrator enrols, a lost
              authenticator can lock the Command Centre.{" "}
              {!auth.session.me.mfa.enrolled ? (
                <a className="font-semibold text-primary" href="/enrol-mfa">
                  Enrol MFA
                </a>
              ) : null}
            </div>
          ) : null}
          {children}
        </main>
      </div>
    </div>
  );
}

function SidebarItem({ item }: { readonly item: NavItem }) {
  const Icon = item.icon;
  const content = (
    <>
      <Icon aria-hidden size={18} className="shrink-0" />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.badge != null ? (
        <span className="min-w-5 rounded-full bg-danger px-1.5 py-0.5 text-center text-[11px] font-bold text-white">
          {item.badge}
        </span>
      ) : null}
    </>
  );

  if (item.href) {
    return (
      <NavLink
        to={item.href}
        aria-label={item.label}
        className={({ isActive }) =>
          `flex min-h-10 items-center gap-3 rounded-[10px] px-3 py-2.5 text-sm transition ${
            isActive
              ? "bg-admin-active font-bold text-white"
              : "font-medium text-admin-copy hover:bg-white/5 hover:text-white"
          }`
        }
      >
        {content}
      </NavLink>
    );
  }

  return (
    <button
      type="button"
      disabled
      aria-label={`${item.label}, coming in a later port`}
      title="Coming in a later port"
      className="flex min-h-10 w-full cursor-not-allowed items-center gap-3 rounded-[10px] px-3 py-2.5 text-left text-sm font-medium text-admin-copy opacity-75"
    >
      {content}
    </button>
  );
}
