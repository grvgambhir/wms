import { useEffect, useRef, useState } from "react";
import { LogOut } from "lucide-react";

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

export function AccountMenu({
  userName,
  email,
  role,
  onSignOut,
}: {
  readonly userName: string;
  readonly email?: string | null;
  readonly role: string;
  readonly onSignOut?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={rootRef} className="relative ml-3">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account menu for ${userName}`}
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-2.5 rounded-lg px-1.5 py-1 transition hover:bg-background"
      >
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-admin-sidebar text-xs font-extrabold text-white">
          {initials(userName)}
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-[13px] font-bold text-text">
            {userName}
          </span>
          <span className="block truncate text-[11px] text-text-muted">
            {role}
          </span>
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          aria-label="Account"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-64 overflow-hidden rounded-xl border border-border bg-surface shadow-panel"
        >
          <div className="border-b border-border px-4 py-3">
            <p className="truncate text-sm font-bold text-text">{userName}</p>
            {email ? (
              <p className="mt-0.5 truncate text-xs text-text-muted">{email}</p>
            ) : null}
            <span className="mt-2 inline-flex items-center rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-extrabold text-text-muted">
              {role}
            </span>
          </div>
          {onSignOut ? (
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                onSignOut();
              }}
              className="flex min-h-11 w-full items-center gap-2 px-4 text-left text-sm font-semibold text-danger transition hover:bg-danger/[0.06]"
            >
              <LogOut aria-hidden size={15} />
              Log out
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
