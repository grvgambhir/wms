import { useState } from "react";
import { Search, UserPlus, Users, X } from "lucide-react";

import { sessionIsOcAdmin, useAuth } from "../auth/AuthProvider";
import { AdminPortalShell } from "../components/layout/AdminPortalShell";
import {
  GRANTABLE_ROLE_CODES,
  canRemovePerson,
  canResendInvite,
  isGrantableRole,
  personDisplayName,
  profileStatusLabel,
  roleGrantKey,
  roleLabel,
  roleScopeLabel,
  type AdminPerson,
  type GrantableRoleCode,
  type PersonRoleGrant,
} from "../domain/adminPeople";
import { useAdminPeople } from "../hooks/useAdminPeople";
import type { AdminPeopleRepository } from "../repositories/AdminPeopleRepository";

type PendingAction =
  | {
      kind: "grant";
      person: AdminPerson;
      roleCode: GrantableRoleCode;
      eventId: string | null;
    }
  | {
      kind: "revoke";
      person: AdminPerson;
      roleCode: string;
      eventId: string | null;
    }
  | { kind: "resend"; person: AdminPerson }
  | { kind: "purge"; person: AdminPerson }
  | { kind: "mfa-reset"; person: AdminPerson };

export function PeoplePage({
  repository,
}: {
  readonly repository?: AdminPeopleRepository;
} = {}) {
  const { session } = useAuth();
  const people = useAdminPeople(repository);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const isOcAdmin = sessionIsOcAdmin(session);

  const confirmPending = async () => {
    if (!pending) return;
    if (pending.kind === "grant") {
      await people.grantRole(
        pending.person.id,
        pending.roleCode,
        pending.eventId,
      );
    } else if (pending.kind === "revoke") {
      await people.revokeRole(
        pending.person.id,
        pending.roleCode,
        pending.eventId,
      );
    } else if (pending.kind === "purge") {
      await people.purgePerson(pending.person.id);
    } else if (pending.kind === "mfa-reset") {
      await people.resetMfa(pending.person.id);
    } else {
      await people.resendInvite(pending.person.id);
    }
    setPending(null);
  };

  return (
    <AdminPortalShell
      userName={session?.me?.givenName ?? session?.username}
      role={session?.me?.roles.includes("oc_admin") ? "OC administrator" : "OC"}
    >
      <div className="mx-auto max-w-[1500px]">
        <div className="mb-[18px] flex items-start gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2.5">
              <Users aria-hidden size={22} className="text-primary" />
              <h1 className="text-2xl font-extrabold tracking-[-0.02em] text-text">
                People &amp; Roles
              </h1>
            </div>
            <p className="mt-1 text-sm text-text-muted">
              Grant and revoke OC staff, administrator, and finance roles.
              Participant is self-service and is not offered here.
            </p>
          </div>
          {isOcAdmin ? (
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-dark"
            >
              <UserPlus aria-hidden size={16} />
              Invite user
            </button>
          ) : null}
        </div>

        <label className="mb-4 flex max-w-xl items-center gap-2 rounded-[10px] border border-border bg-surface px-3 shadow-sm focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
          <Search aria-hidden size={16} className="text-text-muted" />
          <input
            type="search"
            aria-label="Search people"
            placeholder="Search name or email"
            value={people.search}
            onChange={(event) => people.setSearch(event.target.value)}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-text outline-none"
          />
        </label>

        {people.error ? (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-sm text-red-900"
          >
            {people.error}
          </div>
        ) : null}

        {people.isLoading ? (
          <div
            role="status"
            className="grid min-h-64 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel"
          >
            Loading people…
          </div>
        ) : people.items.length === 0 ? (
          <div className="grid min-h-40 place-items-center rounded-xl border border-border bg-surface text-sm text-text-muted shadow-panel">
            No people match this search.
          </div>
        ) : (
          <section className="overflow-hidden rounded-[14px] border border-border bg-surface shadow-panel">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-border bg-surface-muted text-[11px] font-bold uppercase tracking-[0.08em] text-text-muted">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Profile</th>
                  <th className="px-4 py-3">Roles</th>
                  <th className="px-4 py-3">Grant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {people.items.map((person) => (
                  <PersonRow
                    key={person.id}
                    person={person}
                    disabled={people.isMutating}
                    onGrant={(roleCode, eventId) => {
                      if (roleCode === "oc_admin") {
                        setPending({
                          kind: "grant",
                          person,
                          roleCode,
                          eventId,
                        });
                        return;
                      }
                      void people.grantRole(person.id, roleCode, eventId);
                    }}
                    onRevoke={(roleCode, eventId) =>
                      setPending({ kind: "revoke", person, roleCode, eventId })
                    }
                    onResend={() => setPending({ kind: "resend", person })}
                    onRemove={() => setPending({ kind: "purge", person })}
                    onResetMfa={
                      person.mfaEnrolled && person.id !== session?.me?.id
                        ? () => setPending({ kind: "mfa-reset", person })
                        : undefined
                    }
                  />
                ))}
              </tbody>
            </table>
          </section>
        )}

        {people.hasMore ? (
          <button
            type="button"
            onClick={() => void people.loadMore()}
            disabled={people.isLoadingMore}
            className="mt-4 min-h-11 rounded-lg border border-border bg-surface px-4 text-sm font-semibold text-text shadow-sm transition hover:bg-surface-muted disabled:cursor-wait disabled:opacity-60"
          >
            {people.isLoadingMore ? "Loading…" : "Load more"}
          </button>
        ) : null}
      </div>

      {inviteOpen && isOcAdmin ? (
        <InviteDialog
          disabled={people.isMutating}
          onCancel={() => setInviteOpen(false)}
          onInvite={async (input) => {
            const ok = await people.inviteUser(input);
            if (ok) setInviteOpen(false);
          }}
        />
      ) : null}

      {pending ? (
        <ConfirmDialog
          pending={pending}
          disabled={people.isMutating}
          onCancel={() => setPending(null)}
          onConfirm={() => void confirmPending()}
        />
      ) : null}
    </AdminPortalShell>
  );
}

function PersonRow({
  person,
  disabled,
  onGrant,
  onRevoke,
  onResend,
  onRemove,
  onResetMfa,
}: {
  readonly person: AdminPerson;
  readonly disabled: boolean;
  readonly onGrant: (
    roleCode: GrantableRoleCode,
    eventId: string | null,
  ) => void;
  readonly onRevoke: (roleCode: string, eventId: string | null) => void;
  readonly onResend: () => void;
  readonly onRemove: () => void;
  readonly onResetMfa?: () => void;
}) {
  const [roleCode, setRoleCode] = useState<GrantableRoleCode>("oc_staff");
  const [eventId, setEventId] = useState("");
  const name = personDisplayName(person);

  return (
    <tr>
      <th scope="row" className="px-4 py-3 font-bold text-text">
        {name}
      </th>
      <td className="px-4 py-3 text-text-muted">{person.email ?? "—"}</td>
      <td className="px-4 py-3">
        <div className="flex flex-col items-start gap-1.5">
          <span className="rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-extrabold text-text-muted">
            {profileStatusLabel(person.profileStatus)}
          </span>
          {canResendInvite(person) ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onResend}
              className="min-h-8 text-[12px] font-bold text-primary hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              Resend invite
            </button>
          ) : null}
          {canRemovePerson(person) ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onRemove}
              className="min-h-8 text-[12px] font-bold text-danger hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              Remove
            </button>
          ) : null}
          {onResetMfa ? (
            <button
              type="button"
              disabled={disabled}
              onClick={onResetMfa}
              className="min-h-8 text-[12px] font-bold text-danger hover:underline disabled:cursor-wait disabled:opacity-60"
            >
              Reset MFA
            </button>
          ) : null}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1.5">
          {person.roles.length === 0 ? (
            <span className="text-xs text-text-muted">None</span>
          ) : (
            person.roles.map((grant) => (
              <RoleChip
                key={roleGrantKey(grant)}
                grant={grant}
                personName={name}
                disabled={disabled}
                onRevoke={
                  isGrantableRole(grant.roleCode)
                    ? () => onRevoke(grant.roleCode, grant.eventId)
                    : undefined
                }
              />
            ))
          )}
        </div>
      </td>
      <td className="px-4 py-3">
        <form
          className="flex flex-wrap items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            onGrant(roleCode, eventId.trim() ? eventId.trim() : null);
          }}
        >
          <select
            aria-label={`Role to grant ${name}`}
            value={roleCode}
            onChange={(event) =>
              setRoleCode(event.target.value as GrantableRoleCode)
            }
            className="h-11 rounded-lg border border-border bg-surface px-2 text-[13px] font-semibold text-text"
          >
            {GRANTABLE_ROLE_CODES.map((code) => (
              <option key={code} value={code}>
                {roleLabel(code)}
              </option>
            ))}
          </select>
          <input
            aria-label={`Event scope for ${name}`}
            placeholder="Event id (optional)"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
            className="h-11 w-44 rounded-lg border border-border px-2 text-[13px] text-text"
          />
          <button
            type="submit"
            disabled={disabled}
            className="min-h-11 rounded-lg bg-primary px-3.5 text-[13px] font-bold text-white transition hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
          >
            Grant
          </button>
        </form>
      </td>
    </tr>
  );
}

function RoleChip({
  grant,
  personName,
  disabled,
  onRevoke,
}: {
  readonly grant: PersonRoleGrant;
  readonly personName: string;
  readonly disabled: boolean;
  readonly onRevoke?: () => void;
}) {
  const label = roleLabel(grant.roleCode);
  const scope = roleScopeLabel(grant.eventId);
  const shortScope = grant.eventId ? grant.eventId.slice(0, 8) : "global";
  const classes =
    grant.roleCode === "oc_admin"
      ? "border-danger/35 bg-danger/[0.08] text-danger"
      : grant.roleCode === "finance"
        ? "border-primary/35 bg-primary/[0.08] text-primary-dark"
        : "border-border bg-surface-muted text-text";

  if (!onRevoke) {
    return (
      <span
        title={scope}
        className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold ${classes}`}
      >
        {label}
        <span className="font-semibold opacity-70">{shortScope}</span>
      </span>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onRevoke}
      title={scope}
      aria-label={`Revoke ${label} (${scope}) from ${personName}`}
      className={`inline-flex min-h-8 items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-extrabold transition hover:opacity-80 disabled:cursor-wait disabled:opacity-60 ${classes}`}
    >
      {label}
      <span className="font-semibold opacity-70">{shortScope}</span>
      <X aria-hidden size={12} />
    </button>
  );
}

function InviteDialog({
  disabled,
  onCancel,
  onInvite,
}: {
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onInvite: (input: {
    email: string;
    givenName: string;
    familyName: string;
    roleCode: GrantableRoleCode;
    eventId: string | null;
  }) => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [givenName, setGivenName] = useState("");
  const [familyName, setFamilyName] = useState("");
  const [roleCode, setRoleCode] = useState<GrantableRoleCode>("oc_staff");
  const [eventId, setEventId] = useState("");

  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4"
      role="presentation"
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="people-invite-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-panel"
        onSubmit={(event) => {
          event.preventDefault();
          void onInvite({
            email,
            givenName,
            familyName,
            roleCode,
            eventId: eventId.trim() ? eventId.trim() : null,
          });
        }}
      >
        <h2
          id="people-invite-title"
          className="text-lg font-extrabold text-text"
        >
          Invite user
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Cognito emails a temporary password. Their role is already granted on
          first sign-in.
        </p>
        <label className="mt-4 block text-sm font-medium text-text">
          Email
          <input
            className="mt-1 h-11 w-full rounded-lg border border-border px-3"
            type="email"
            autoComplete="off"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium text-text">
            First name
            <input
              className="mt-1 h-11 w-full rounded-lg border border-border px-3"
              value={givenName}
              onChange={(event) => setGivenName(event.target.value)}
              required
            />
          </label>
          <label className="block text-sm font-medium text-text">
            Last name
            <input
              className="mt-1 h-11 w-full rounded-lg border border-border px-3"
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              required
            />
          </label>
        </div>
        <label className="mt-3 block text-sm font-medium text-text">
          Role
          <select
            aria-label="Role to invite"
            value={roleCode}
            onChange={(event) =>
              setRoleCode(event.target.value as GrantableRoleCode)
            }
            className="mt-1 h-11 w-full rounded-lg border border-border bg-surface px-2 text-sm font-semibold text-text"
          >
            {GRANTABLE_ROLE_CODES.map((code) => (
              <option key={code} value={code}>
                {roleLabel(code)}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium text-text">
          Event id (optional)
          <input
            className="mt-1 h-11 w-full rounded-lg border border-border px-3"
            placeholder="Leave blank for a global role"
            value={eventId}
            onChange={(event) => setEventId(event.target.value)}
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={disabled}
            className="min-h-11 rounded-lg bg-primary px-4 text-sm font-bold text-white hover:bg-primary-dark disabled:cursor-wait disabled:opacity-60"
          >
            {disabled ? "Inviting…" : "Send invitation"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ConfirmDialog({
  pending,
  disabled,
  onCancel,
  onConfirm,
}: {
  readonly pending: PendingAction;
  readonly disabled: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}) {
  const name = personDisplayName(pending.person);
  const title =
    pending.kind === "purge"
      ? `Remove ${name}?`
      : pending.kind === "mfa-reset"
        ? `Reset MFA for ${name}?`
        : pending.kind === "resend"
          ? "Resend invitation?"
          : pending.kind === "grant" && pending.roleCode === "oc_admin"
            ? "Grant administrator rights?"
            : pending.kind === "grant"
              ? `Grant ${roleLabel(pending.roleCode)}?`
              : `Revoke ${roleLabel(pending.roleCode)} (${roleScopeLabel(pending.eventId)})?`;
  const body =
    pending.kind === "purge"
      ? `Remove ${name} from the Command Centre. Their Cognito account will be deleted too.`
      : pending.kind === "mfa-reset"
        ? `${name} will need to enrol a new authenticator before they can hold a privileged session once MFA is enforced.`
        : pending.kind === "resend"
          ? `Resending replaces the temporary password. Any earlier invitation email for ${name} will stop working.`
          : pending.kind === "grant" && pending.roleCode === "oc_admin"
            ? `${name} will be able to grant and revoke administrator rights, including removing you.`
            : pending.kind === "revoke"
              ? `Revoke ${roleLabel(pending.roleCode)} (${roleScopeLabel(pending.eventId)}) from ${name}?`
              : `Grant ${roleLabel(pending.roleCode)} to ${name}?`;
  const confirmLabel =
    pending.kind === "purge"
      ? "Remove"
      : pending.kind === "mfa-reset"
        ? "Reset MFA"
        : pending.kind === "resend"
          ? "Resend invite"
          : pending.kind === "revoke"
            ? "Revoke"
            : pending.roleCode === "oc_admin"
              ? "Grant administrator role"
              : "Grant";

  return (
    <div
      className="fixed inset-0 z-20 grid place-items-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="people-confirm-title"
        className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-panel"
      >
        <h2
          id="people-confirm-title"
          className="text-lg font-extrabold text-text"
        >
          {title}
        </h2>
        <p className="mt-2 text-sm text-text-muted">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="min-h-11 rounded-lg border border-border px-4 text-sm font-semibold text-text hover:bg-surface-muted disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={disabled}
            className={`min-h-11 rounded-lg px-4 text-sm font-bold text-white disabled:cursor-wait disabled:opacity-60 ${pending.kind === "revoke" || pending.kind === "purge" || pending.kind === "mfa-reset" ? "bg-danger hover:bg-red-700" : "bg-primary hover:bg-primary-dark"}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
