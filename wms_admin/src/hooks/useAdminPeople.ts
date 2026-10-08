import { useCallback, useEffect, useRef, useState } from "react";

import {
  clonePersonRoles,
  explainAdminPeopleError,
  PAGE_SIZE,
  sameRoleGrant,
  type AdminPerson,
  type GrantableRoleCode,
} from "../domain/adminPeople";
import { adminPeopleRepository } from "../repositories/provider";
import type { AdminPeopleRepository } from "../repositories/AdminPeopleRepository";
import { useToast } from "../components/ui/ToastProvider";

function actionKey(
  kind: "grant" | "revoke" | "resend" | "purge",
  personId: string,
  roleCode: string,
  eventId: string | null,
): string {
  return `${kind}:${personId}:${roleCode}:${eventId ?? ""}`;
}

export interface UseAdminPeopleResult {
  readonly items: readonly AdminPerson[];
  readonly hasMore: boolean;
  readonly search: string;
  readonly isLoading: boolean;
  readonly isLoadingMore: boolean;
  readonly isMutating: boolean;
  readonly error: string | null;
  readonly setSearch: (value: string) => void;
  readonly loadMore: () => Promise<void>;
  readonly reload: () => Promise<void>;
  readonly grantRole: (
    personId: string,
    roleCode: GrantableRoleCode,
    eventId?: string | null,
  ) => Promise<boolean>;
  readonly revokeRole: (
    personId: string,
    roleCode: string,
    eventId?: string | null,
  ) => Promise<boolean>;
  readonly inviteUser: (input: {
    email: string;
    givenName: string;
    familyName: string;
    roleCode: GrantableRoleCode;
    eventId?: string | null;
  }) => Promise<boolean>;
  readonly resendInvite: (personId: string) => Promise<boolean>;
  readonly purgePerson: (personId: string) => Promise<boolean>;
  readonly resetMfa: (personId: string) => Promise<boolean>;
}

export function useAdminPeople(
  repository: AdminPeopleRepository = adminPeopleRepository,
): UseAdminPeopleResult {
  const [items, setItems] = useState<AdminPerson[]>([]);
  const [cursor, setCursor] = useState<string | undefined>();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [isMutating, setIsMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingKeys = useRef(new Map<string, string>());
  const generation = useRef(0);
  const { showToast } = useToast();

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchInput.trim());
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  const keyFor = useCallback(
    (
      kind: "grant" | "revoke" | "resend" | "purge",
      personId: string,
      roleCode: string,
      eventId: string | null,
    ) => {
      const mapKey = actionKey(kind, personId, roleCode, eventId);
      const existing = pendingKeys.current.get(mapKey);
      if (existing) return existing;
      const created = crypto.randomUUID();
      pendingKeys.current.set(mapKey, created);
      return created;
    },
    [],
  );

  const loadFirstPage = useCallback(
    async (query: string) => {
      const gen = generation.current + 1;
      generation.current = gen;
      setIsLoading(true);
      setError(null);
      try {
        const page = await repository.listPeople({
          search: query,
          limit: PAGE_SIZE,
        });
        if (generation.current !== gen) return;
        setItems(page.items);
        setCursor(page.cursor);
      } catch (caught) {
        if (generation.current !== gen) return;
        setError(explainAdminPeopleError(caught));
        setItems([]);
        setCursor(undefined);
      } finally {
        if (generation.current === gen) setIsLoading(false);
      }
    },
    [repository],
  );

  useEffect(() => {
    void loadFirstPage(search);
  }, [loadFirstPage, search]);

  const loadMore = useCallback(async () => {
    if (!cursor || isLoadingMore) return;
    setIsLoadingMore(true);
    setError(null);
    try {
      const page = await repository.listPeople({
        search,
        cursor,
        limit: PAGE_SIZE,
      });
      setItems((current) => [...current, ...page.items]);
      setCursor(page.cursor);
    } catch (caught) {
      setError(explainAdminPeopleError(caught));
    } finally {
      setIsLoadingMore(false);
    }
  }, [cursor, isLoadingMore, repository, search]);

  const reload = useCallback(async () => {
    await loadFirstPage(search);
  }, [loadFirstPage, search]);

  const grantRole = useCallback(
    async (
      personId: string,
      roleCode: GrantableRoleCode,
      eventId?: string | null,
    ) => {
      const scopedEvent = eventId?.trim() ? eventId.trim() : null;
      const snapshot = items.map((person) => ({
        ...person,
        roles: clonePersonRoles(person.roles),
      }));
      setIsMutating(true);
      setError(null);
      setItems((current) =>
        current.map((person) =>
          person.id === personId &&
          !person.roles.some((grant) =>
            sameRoleGrant(grant, roleCode, scopedEvent),
          )
            ? {
                ...person,
                roles: [...person.roles, { roleCode, eventId: scopedEvent }],
              }
            : person,
        ),
      );
      try {
        await repository.grantRole({
          personId,
          roleCode,
          eventId: scopedEvent,
          idempotencyKey: keyFor("grant", personId, roleCode, scopedEvent),
        });
        pendingKeys.current.delete(
          actionKey("grant", personId, roleCode, scopedEvent),
        );
        showToast({ variant: "success", title: "Role granted" });
        return true;
      } catch (caught) {
        setItems(snapshot);
        const message = explainAdminPeopleError(caught);
        setError(message);
        showToast({
          variant: "error",
          title: "Grant failed",
          description: message,
        });
        const code =
          caught instanceof Error && "code" in caught
            ? String(caught.code)
            : "";
        if (code === "PERSON_NOT_FOUND" || code === "PERSON_ROLE_NOT_FOUND") {
          await loadFirstPage(search);
        }
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [items, keyFor, loadFirstPage, repository, search, showToast],
  );

  const revokeRole = useCallback(
    async (personId: string, roleCode: string, eventId?: string | null) => {
      const scopedEvent = eventId?.trim() ? eventId.trim() : null;
      const snapshot = items.map((person) => ({
        ...person,
        roles: clonePersonRoles(person.roles),
      }));
      setIsMutating(true);
      setError(null);
      setItems((current) =>
        current.map((person) =>
          person.id === personId
            ? {
                ...person,
                roles: person.roles.filter(
                  (grant) => !sameRoleGrant(grant, roleCode, scopedEvent),
                ),
              }
            : person,
        ),
      );
      try {
        await repository.revokeRole({
          personId,
          roleCode,
          eventId: scopedEvent,
          idempotencyKey: keyFor("revoke", personId, roleCode, scopedEvent),
        });
        pendingKeys.current.delete(
          actionKey("revoke", personId, roleCode, scopedEvent),
        );
        showToast({ variant: "success", title: "Role revoked" });
        return true;
      } catch (caught) {
        setItems(snapshot);
        const message = explainAdminPeopleError(caught);
        setError(message);
        showToast({
          variant: "error",
          title: "Revoke failed",
          description: message,
        });
        const code =
          caught instanceof Error && "code" in caught
            ? String(caught.code)
            : "";
        if (code === "PERSON_NOT_FOUND" || code === "PERSON_ROLE_NOT_FOUND") {
          await loadFirstPage(search);
        }
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [items, keyFor, loadFirstPage, repository, search, showToast],
  );

  const inviteUser = useCallback(
    async (input: {
      email: string;
      givenName: string;
      familyName: string;
      roleCode: GrantableRoleCode;
      eventId?: string | null;
    }) => {
      const email = input.email.trim();
      const scopedEvent = input.eventId?.trim() ? input.eventId.trim() : null;
      setIsMutating(true);
      setError(null);
      try {
        const created = await repository.inviteUser({
          email,
          givenName: input.givenName.trim(),
          familyName: input.familyName.trim(),
          roleCode: input.roleCode,
          eventId: scopedEvent,
          idempotencyKey: keyFor(
            "grant",
            `invite:${email}`,
            input.roleCode,
            scopedEvent,
          ),
        });
        pendingKeys.current.delete(
          actionKey("grant", `invite:${email}`, input.roleCode, scopedEvent),
        );
        setItems((current) =>
          current.some((person) => person.id === created.id)
            ? current
            : [created, ...current],
        );
        showToast({
          variant: "success",
          title: "Invitation sent",
          description: email,
        });
        return true;
      } catch (caught) {
        const message = explainAdminPeopleError(caught);
        setError(message);
        showToast({
          variant: "error",
          title: "Invite failed",
          description: message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [keyFor, repository, showToast],
  );

  const resendInvite = useCallback(
    async (personId: string) => {
      setIsMutating(true);
      setError(null);
      try {
        await repository.resendInvite({
          personId,
          idempotencyKey: keyFor("resend", personId, "invite", null),
        });
        pendingKeys.current.delete(
          actionKey("resend", personId, "invite", null),
        );
        const destination = items.find((person) => person.id === personId)?.email;
        showToast({
          variant: "success",
          title: destination ? `Invitation sent to ${destination}` : "Invitation resent",
          description: "Ask them to check spam — that is usually where the first one landed.",
        });
        return true;
      } catch (caught) {
        const message = explainAdminPeopleError(caught);
        setError(message);
        showToast({
          variant: "error",
          title: "Resend failed",
          description: message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [items, keyFor, repository, showToast],
  );

  const purgePerson = useCallback(
    async (personId: string) => {
      const snapshot = items;
      setIsMutating(true);
      setError(null);
      setItems((current) => current.filter((person) => person.id !== personId));
      try {
        await repository.purgePerson({
          personId,
          idempotencyKey: keyFor("purge", personId, "person", null),
        });
        pendingKeys.current.delete(
          actionKey("purge", personId, "person", null),
        );
        showToast({ variant: "success", title: "Person removed" });
        return true;
      } catch (caught) {
        setItems(snapshot);
        const message = explainAdminPeopleError(caught);
        setError(message);
        showToast({
          variant: "error",
          title: "Remove failed",
          description: message,
        });
        const code =
          caught instanceof Error && "code" in caught
            ? String(caught.code)
            : "";
        if (code === "PERSON_NOT_FOUND") {
          await loadFirstPage(search);
        }
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [items, keyFor, loadFirstPage, repository, search, showToast],
  );

  const resetMfa = useCallback(
    async (personId: string) => {
      const snapshot = items;
      setIsMutating(true);
      setError(null);
      setItems((current) =>
        current.map((person) =>
          person.id === personId ? { ...person, mfaEnrolled: false } : person,
        ),
      );
      try {
        await repository.resetMfa({
          personId,
          idempotencyKey: keyFor("purge", personId, "mfa", null),
        });
        pendingKeys.current.delete(actionKey("purge", personId, "mfa", null));
        showToast({ variant: "success", title: "MFA reset" });
        return true;
      } catch (caught) {
        setItems(snapshot);
        const message = explainAdminPeopleError(caught);
        setError(message);
        showToast({
          variant: "error",
          title: "MFA reset failed",
          description: message,
        });
        return false;
      } finally {
        setIsMutating(false);
      }
    },
    [items, keyFor, repository, showToast],
  );

  return {
    items,
    hasMore: cursor != null,
    search: searchInput,
    isLoading,
    isLoadingMore,
    isMutating,
    error,
    setSearch: setSearchInput,
    loadMore,
    reload,
    grantRole,
    revokeRole,
    inviteUser,
    resendInvite,
    purgePerson,
    resetMfa,
  };
}
