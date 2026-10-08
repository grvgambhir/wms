import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { repositories } from '@/data/providers/repositories';
import { getJson, setJson } from '@/data/storage/asyncStorage';
import { storageKeys } from '@/data/storage/keys';
import type { AthleteProfile } from '@/domain/models/athlete';
import type { MyEntry } from '@/domain/models/myEntries';
import type { EvidenceGateStatus, ParticipantEntryExport } from '@/domain/models/evidence';
import type {
  EntryDecision,
  EntryGrade,
  EntryQuota,
  Fee,
  JourneyEntryStatus,
  PayOrderResponse,
  RegistrationJourneySnapshot,
  SportEntryProduct,
  WaitlistActionResponse,
} from '@/domain/models/registrationJourney';
import type { CategoryDerivation, CategoryImpact, RosterMember, SportRule } from '@/domain/models/rule';
import type { Sport } from '@/domain/models/sport';
import type { RosterChangeProposal, TeamRoster, TeamRosterMember } from '@/domain/models/teamRoster';
import { categoryImpact, deriveCategory } from '@/features/rules/engine';
import { useRuleForEvent } from '@/features/rules/hooks/useRules';
import { useAuthSession, useMeProfile } from '@/features/auth/hooks/useAuth';
import { newIdempotencyKey } from '@/features/profile/completeProfile';
import { MY_ENTRIES_QUERY_KEY, useMyEntries } from '@/features/registration/hooks/useMyEntries';
import { isDemoSession } from '@/auth/session';

type JourneySelection = {
  sportEntryProductId: string;
  partnerAthleteId?: string;
  grade: EntryGrade;
};

type RegistrationJourneyContextValue = {
  /** The entry every journey screen is working on. `null` until one is resolved. */
  entryId: string | null;
  /** The signed-in person's entries (`GET /v1/me/entries`). */
  entries: MyEntry[];
  /** Loaded, and the person has no entries — screens show "register for a sport", not an error. */
  needsEntry: boolean;
  /** Make `entryId` the active entry. Refreshes the list first so a just-created entry is in it. */
  openEntry: (entryId: string) => Promise<void>;
  snapshot?: RegistrationJourneySnapshot;
  selection: JourneySelection;
  selectedProduct?: SportEntryProduct;
  selectedSport?: Sport;
  selectedPartner?: AthleteProfile;
  selectedRule?: SportRule;
  selectedFee?: Fee;
  selectedQuota?: EntryQuota;
  teamRoster?: TeamRoster;
  rosterMembers: TeamRosterMember[];
  rosterImpact: CategoryImpact | null;
  derivation: CategoryDerivation | null;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  isActionPending: boolean;
  isRosterLoading: boolean;
  isRosterError: boolean;
  rosterError: Error | null;
  actionError: Error | null;
  paymentResult?: PayOrderResponse;
  exportResult?: ParticipantEntryExport;
  selectProduct: (productId: string) => void;
  selectPartner: (athleteId: string) => void;
  selectGrade: (grade: EntryGrade) => void;
  addRosterMember: (memberId: string) => void;
  substituteRosterMember: (outMemberId: string, inMemberId: string) => void;
  resetRoster: () => void;
  createTeam: () => Promise<void>;
  confirmSelection: () => Promise<EntryDecision>;
  /**
   * The only way a *confirmed* team's roster can change (RUL-03/04): a proposal the OC must
   * approve, never a direct overwrite. `confirmSelection` above still owns the pre-confirmation
   * build path — this is additive, not a replacement for it.
   */
  proposeRosterChange: (input: { replacePersonId?: string; withPersonId: string }) => Promise<RosterChangeProposal>;
  applyEvidenceStatus: (status: EvidenceGateStatus) => Promise<void>;
  exportParticipantEntry: () => Promise<ParticipantEntryExport>;
  joinWaitlist: () => Promise<WaitlistActionResponse>;
  releaseWaitlistOffer: () => Promise<WaitlistActionResponse>;
  expireWaitlistOffer: () => Promise<WaitlistActionResponse>;
  claimWaitlistOffer: () => Promise<WaitlistActionResponse>;
  payOrder: (simulateFirstAttemptTimeout: boolean) => Promise<PayOrderResponse>;
  transitionStatus: (toStatus: JourneyEntryStatus, reason?: string) => Promise<void>;
  withdrawEntry: (reason?: string) => Promise<void>;
  retry: () => void;
};

const RegistrationJourneyContext = createContext<RegistrationJourneyContextValue | null>(null);

function fullName(athlete: AthleteProfile): string {
  return `${athlete.firstName} ${athlete.lastName}`;
}

export function RegistrationJourneyProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const hydratedEntryId = useRef<string | null>(null);
  const rosterHydratedProduct = useRef<string | null>(null);
  const paymentKeys = useRef(new Map<string, string>());
  const [selection, setSelection] = useState<JourneySelection>({
    sportEntryProductId: '',
    grade: 'competitive',
  });
  const [rosterMemberIds, setRosterMemberIds] = useState<string[]>([]);

  const authSession = useAuthSession();
  const isDemo = !!authSession.data && isDemoSession(authSession.data);
  const meProfileQuery = useMeProfile(!!authSession.data && !isDemo);

  // WHICH ENTRY. This used to be one hard-coded id — Daniel Harper's Men's Doubles entry — for
  // whoever was signed in. It is now the person's own list: the entry they last opened if it is
  // still theirs, otherwise their newest. The remembered id is only a preference; it is honoured
  // only when it appears in the token-scoped list, so an id left on a shared device by another
  // account is never requested.
  const entriesQuery = useMyEntries(Boolean(authSession.data));
  const entries = useMemo(() => entriesQuery.data?.items ?? [], [entriesQuery.data]);
  const [chosenEntryId, setChosenEntryId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void getJson<string>(storageKeys.activeRegistrationEntry).then((stored) => {
      if (live && stored) setChosenEntryId((current) => current ?? stored);
    });
    return () => {
      live = false;
    };
  }, []);
  const activeEntry = entries.find((entry) => entry.id === chosenEntryId) ?? entries[0];
  const entryId = activeEntry?.id ?? null;
  const journeyKey = useMemo(() => ['registration-journey', entryId] as const, [entryId]);

  const openEntry = useCallback(
    async (nextEntryId: string) => {
      await queryClient.invalidateQueries({ queryKey: MY_ENTRIES_QUERY_KEY });
      setChosenEntryId(nextEntryId);
      await setJson(storageKeys.activeRegistrationEntry, nextEntryId);
    },
    [queryClient],
  );

  const journeyQuery = useQuery({
    queryKey: journeyKey,
    queryFn: () =>
      repositories.registrationJourney.getJourney({
        eventId: activeEntry!.eventId,
        // The backend takes the athlete from the token and ignores this. Sent empty so the
        // request does not look like it chooses whose journey it reads.
        athleteId: '',
        registrationEntryId: entryId!,
      }),
    enabled: Boolean(entryId && activeEntry),
  });

  // Category derivation uses the signed-in person's own date of birth (GET /v1/me), so a profile
  // correction is reflected before the entry is saved.
  const selfDateOfBirth = meProfileQuery.data?.dateOfBirth ?? journeyQuery.data?.athlete.dateOfBirth;

  useEffect(() => {
    if (!journeyQuery.data || hydratedEntryId.current === journeyQuery.data.entry.id) return;
    hydratedEntryId.current = journeyQuery.data.entry.id;
    rosterHydratedProduct.current = null;
    setRosterMemberIds([]);
    setSelection({
      sportEntryProductId: journeyQuery.data.entry.sportEntryProductId,
      partnerAthleteId: journeyQuery.data.entry.partnerAthleteId,
      grade: journeyQuery.data.entry.grade,
    });
  }, [journeyQuery.data]);

  const selectedProduct = journeyQuery.data?.sportEntryProducts.items.find(
    (item) => item.id === selection.sportEntryProductId,
  );
  const selectedSport = journeyQuery.data?.sports.items.find((item) => item.id === selectedProduct?.sportId);
  const selectedPartner = journeyQuery.data?.partners.items.find(
    (item) => item.id === selection.partnerAthleteId,
  );
  const liveRuleQuery = useRuleForEvent(
    selectedSport?.name ?? '',
    selectedProduct?.name,
    Boolean(selectedSport?.name && selectedProduct?.name),
  );
  const selectedRule = liveRuleQuery.data ?? undefined;
  const isTeamRosterProduct =
    selectedProduct?.participantType === 'team' || selectedProduct?.participantType === 'crew';
  const teamRosterQuery = useQuery({
    queryKey: ['team-roster', journeyQuery.data?.entry.id, selectedProduct?.id],
    queryFn: () =>
      repositories.teamRosters.getTeamRoster({
        registrationEntryId: journeyQuery.data!.entry.id,
        sportEntryProductId: selectedProduct!.id,
      }),
    enabled: Boolean(journeyQuery.data && selectedProduct && isTeamRosterProduct),
  });
  const createTeamMutation = useMutation({
    mutationFn: async () => {
      const entry = journeyQuery.data?.entry;
      if (!entry) throw new Error('The entry is still loading.');
      await repositories.teamRosters.createTeam(entry.id);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['team-roster', journeyQuery.data?.entry.id, selectedProduct?.id] });
      await journeyQuery.refetch();
    },
  });

  useEffect(() => {
    if (!teamRosterQuery.data || rosterHydratedProduct.current === teamRosterQuery.data.sportEntryProductId) return;
    rosterHydratedProduct.current = teamRosterQuery.data.sportEntryProductId;
    const savedIds =
      journeyQuery.data?.entry.sportEntryProductId === teamRosterQuery.data.sportEntryProductId
        ? journeyQuery.data.entry.rosterMemberIds
        : undefined;
    setRosterMemberIds(
      savedIds?.length
        ? savedIds
        : teamRosterQuery.data.originalMemberIds.length
          ? teamRosterQuery.data.originalMemberIds
          : teamRosterQuery.data.members.map((member) => member.id),
    );
  }, [journeyQuery.data?.entry, teamRosterQuery.data]);

  const rosterMembers = useMemo(
    () => teamRosterQuery.data?.members.filter((member) => rosterMemberIds.includes(member.id)) ?? [],
    [rosterMemberIds, teamRosterQuery.data],
  );

  const derivation = useMemo(() => {
    if (!journeyQuery.data?.athlete || !selectedProduct || !selectedRule) return null;
    if (isTeamRosterProduct) {
      return rosterMembers.length ? deriveCategory(rosterMembers, selectedRule) : null;
    }
    const roster: RosterMember[] = [
      {
        id: journeyQuery.data.athlete.id,
        name: fullName(journeyQuery.data.athlete),
        dob: selfDateOfBirth ?? journeyQuery.data.athlete.dateOfBirth,
        role: selectedProduct.participantType === 'team' ? 'captain' : 'entrant',
      },
    ];
    if (selectedProduct.partnerRequired && selectedPartner) {
      roster.push({
        id: selectedPartner.id,
        name: fullName(selectedPartner),
        dob: selectedPartner.dateOfBirth,
        role: selectedProduct.participantType === 'team' ? 'team-member' : 'partner',
      });
    }
    return deriveCategory(roster, selectedRule);
  }, [
    isTeamRosterProduct,
    journeyQuery.data?.athlete,
    rosterMembers,
    selectedPartner,
    selectedProduct,
    selectedRule,
    selfDateOfBirth,
  ]);

  const rosterImpact = useMemo(() => {
    if (!teamRosterQuery.data || !selectedRule || !derivation) return null;
    const originalMembers = teamRosterQuery.data.members.filter((member) =>
      teamRosterQuery.data.originalMemberIds.includes(member.id),
    );
    return categoryImpact(
      deriveCategory(originalMembers, selectedRule),
      derivation,
      selectedProduct?.participantType === 'crew'
        ? 'Substitution revalidated under the active crew-average rule.'
        : 'Younger player added; team category, fee and quota revalidated.',
    );
  }, [derivation, selectedProduct?.participantType, selectedRule, teamRosterQuery.data]);

  const selectedFee = journeyQuery.data?.fees.items.find(
    (item) =>
      item.sportEntryProductId === selectedProduct?.id &&
      item.grade === selection.grade &&
      (item.categoryId === derivation?.band?.id || item.categoryId == null),
  );
  const selectedQuota = journeyQuery.data?.quotas.items.find(
    (item) =>
      item.sportEntryProductId === selectedProduct?.id &&
      (item.categoryId === derivation?.band?.id || item.categoryId == null),
  );

  const updateSnapshot = useCallback(
    (response: EntryDecision | WaitlistActionResponse | PayOrderResponse) => {
      queryClient.setQueryData<RegistrationJourneySnapshot>(journeyKey, (current) => {
        if (!current) return current;
        const quota = 'quota' in response ? response.quota : null;
        return {
          ...current,
          entry: response.entry,
          quotas: quota
            ? {
                ...current.quotas,
                items: current.quotas.items.map((item) => (item.id === quota.id ? quota : item)),
              }
            : current.quotas,
          waitlist: 'waitlist' in response ? response.waitlist : current.waitlist,
          order: response.order,
          payment: 'payment' in response ? response.payment : current.payment,
        };
      });
    },
    [queryClient, journeyKey],
  );

  const saveEntryMutation = useMutation({
    mutationFn: () => {
      if (!journeyQuery.data || !selectedProduct || !derivation) {
        throw new Error('The entry is still loading.');
      }
      return repositories.registrationJourney.saveEntry({
        registrationEntryId: journeyQuery.data.entry.id,
        sportEntryProductId: selectedProduct.id,
        partnerAthleteId:
          selectedProduct.partnerRequired && !isTeamRosterProduct ? selection.partnerAthleteId : undefined,
        grade: selection.grade,
        teamRosterId: isTeamRosterProduct ? teamRosterQuery.data?.id : undefined,
        rosterMemberIds: isTeamRosterProduct ? rosterMemberIds : undefined,
        // One key per tap. The old key was built from the selection, so saving the same selection
        // again (after a withdrawal and reinstatement) replayed the first save.
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: updateSnapshot,
  });

  const proposeRosterChangeMutation = useMutation({
    mutationFn: (input: { replacePersonId?: string; withPersonId: string }) => {
      if (!journeyQuery.data) throw new Error('The entry is still loading.');
      return repositories.teamRosters.proposeRosterChange({
        registrationEntryId: journeyQuery.data.entry.id,
        replacePersonId: input.replacePersonId,
        withPersonId: input.withPersonId,
      });
    },
  });

  const waitlistMutation = useMutation({
    mutationFn: ({ action }: { action: 'join' | 'release' | 'expire' | 'claim' }) => {
      const waitlistId = journeyQuery.data?.waitlist?.id;
      if (!waitlistId) throw new Error('The waitlist entry is unavailable.');
      const input = { waitlistId, idempotencyKey: newIdempotencyKey() };
      if (action === 'join') return repositories.registrationJourney.joinWaitlist(input);
      if (action === 'release') return repositories.registrationJourney.releaseWaitlistOffer(input);
      if (action === 'expire') return repositories.registrationJourney.expireWaitlistOffer(input);
      return repositories.registrationJourney.claimWaitlistOffer(input);
    },
    onSuccess: updateSnapshot,
  });

  const paymentMutation = useMutation({
    mutationFn: (simulateFirstAttemptTimeout: boolean) => {
      const orderId = journeyQuery.data?.order?.id;
      if (!orderId) throw new Error('The checkout order is unavailable.');
      // One key per ORDER, not per tap and not constant. Retrying payment for the same order must
      // reuse its key (PAY-04: a timed-out first attempt must not charge twice). The old constant
      // key was shared by every order, so a second order replayed the first one's payment.
      let key = paymentKeys.current.get(orderId);
      if (!key) {
        key = newIdempotencyKey();
        paymentKeys.current.set(orderId, key);
      }
      return repositories.registrationJourney.payOrder({
        orderId,
        idempotencyKey: key,
        method: 'card',
        simulateFirstAttemptTimeout,
      });
    },
    onSuccess: updateSnapshot,
  });

  const evidenceStatusMutation = useMutation({
    mutationFn: (evidenceStatus: EvidenceGateStatus) => {
      if (!journeyQuery.data) throw new Error('The entry is still loading.');
      return repositories.registrationJourney.updateEvidenceStatus({
        registrationEntryId: journeyQuery.data.entry.id,
        evidenceStatus,
      });
    },
    onSuccess: (entry) => {
      queryClient.setQueryData<RegistrationJourneySnapshot>(journeyKey, (current) =>
        current
          ? {
              ...current,
              entry,
              order: current.order
                ? { ...current.order, status: entry.status === 'pending_payment' ? 'pending_payment' : 'draft', updatedAt: entry.updatedAt }
                : null,
            }
          : current,
      );
    },
  });

  const exportMutation = useMutation({
    mutationFn: async () => {
      if (!journeyQuery.data) throw new Error('The entry is still loading.');
      const response = await repositories.registrationJourney.exportParticipantEntry({
        registrationEntryId: journeyQuery.data.entry.id,
      });
      return response.export;
    },
  });

  // REG-11 — participant-driven lifecycle transitions (e.g. withdraw). Replaces the
  // entry in the query cache so P16 reflects the new state immediately.
  const statusTransitionMutation = useMutation({
    mutationFn: ({ toStatus, reason }: { toStatus: JourneyEntryStatus; reason?: string }) => {
      if (!journeyQuery.data) throw new Error('The entry is still loading.');
      return repositories.registrationJourney.transitionEntryStatus({
        registrationEntryId: journeyQuery.data.entry.id,
        toStatus,
        actor: 'participant',
        reason,
        idempotencyKey: newIdempotencyKey(),
      });
    },
    onSuccess: (entry) => {
      queryClient.setQueryData<RegistrationJourneySnapshot>(journeyKey, (current) =>
        current ? { ...current, entry } : current,
      );
      void queryClient.invalidateQueries({ queryKey: MY_ENTRIES_QUERY_KEY });
    },
  });

  const selectProduct = useCallback(
    (productId: string) => {
      const product = journeyQuery.data?.sportEntryProducts.items.find((item) => item.id === productId);
      if (!product) return;
      rosterHydratedProduct.current = null;
      setRosterMemberIds([]);
      setSelection((current) => ({
        sportEntryProductId: product.id,
        // No default partner. This used to pre-select a demo athlete for everyone.
        partnerAthleteId: product.participantType === 'doubles' ? current.partnerAthleteId : undefined,
        grade: product.allowedGrades.includes(current.grade) ? current.grade : product.allowedGrades[0],
      }));
    },
    [journeyQuery.data?.sportEntryProducts.items],
  );

  const addRosterMember = useCallback((memberId: string) => {
    setRosterMemberIds((current) => (current.includes(memberId) ? current : [...current, memberId]));
  }, []);

  const substituteRosterMember = useCallback((outMemberId: string, inMemberId: string) => {
    setRosterMemberIds((current) => current.map((id) => (id === outMemberId ? inMemberId : id)));
  }, []);

  const resetRoster = useCallback(() => {
    if (teamRosterQuery.data) setRosterMemberIds(teamRosterQuery.data.originalMemberIds);
  }, [teamRosterQuery.data]);

  const errors = [saveEntryMutation.error, waitlistMutation.error, paymentMutation.error, evidenceStatusMutation.error, exportMutation.error, statusTransitionMutation.error, createTeamMutation.error, proposeRosterChangeMutation.error];
  const actionError = errors.find((error): error is Error => error instanceof Error) ?? null;
  const value = useMemo<RegistrationJourneyContextValue>(
    () => ({
      entryId,
      entries,
      needsEntry: entriesQuery.isSuccess && entries.length === 0,
      openEntry,
      snapshot: journeyQuery.data,
      selection,
      selectedProduct,
      selectedSport,
      selectedPartner,
      selectedRule,
      selectedFee,
      selectedQuota,
      teamRoster: teamRosterQuery.data,
      rosterMembers,
      rosterImpact,
      derivation,
      isLoading:
        entriesQuery.isLoading ||
        (Boolean(entryId) && !journeyQuery.data && !journeyQuery.isError) ||
        Boolean(selectedSport && selectedProduct && liveRuleQuery.isLoading),
      isError: entriesQuery.isError || journeyQuery.isError,
      error: entriesQuery.error ?? journeyQuery.error,
      isActionPending:
        saveEntryMutation.isPending ||
        waitlistMutation.isPending ||
        paymentMutation.isPending ||
        evidenceStatusMutation.isPending ||
        exportMutation.isPending ||
        statusTransitionMutation.isPending ||
        createTeamMutation.isPending ||
        proposeRosterChangeMutation.isPending,
      isRosterLoading: teamRosterQuery.isLoading,
      isRosterError: teamRosterQuery.isError,
      rosterError: teamRosterQuery.error,
      actionError,
      paymentResult: paymentMutation.data,
      exportResult: exportMutation.data,
      selectProduct,
      selectPartner: (athleteId) => setSelection((current) => ({ ...current, partnerAthleteId: athleteId })),
      selectGrade: (grade) => setSelection((current) => ({ ...current, grade })),
      addRosterMember,
      substituteRosterMember,
      resetRoster,
      createTeam: async () => { await createTeamMutation.mutateAsync(); },
      confirmSelection: () => saveEntryMutation.mutateAsync(),
      proposeRosterChange: (input) => proposeRosterChangeMutation.mutateAsync(input),
      applyEvidenceStatus: async (status) => { await evidenceStatusMutation.mutateAsync(status); },
      exportParticipantEntry: () => exportMutation.mutateAsync(),
      joinWaitlist: () => waitlistMutation.mutateAsync({ action: 'join' }),
      releaseWaitlistOffer: () => waitlistMutation.mutateAsync({ action: 'release' }),
      expireWaitlistOffer: () => waitlistMutation.mutateAsync({ action: 'expire' }),
      claimWaitlistOffer: () => waitlistMutation.mutateAsync({ action: 'claim' }),
      payOrder: (simulateFirstAttemptTimeout) => paymentMutation.mutateAsync(simulateFirstAttemptTimeout),
      transitionStatus: async (toStatus, reason) => { await statusTransitionMutation.mutateAsync({ toStatus, reason }); },
      withdrawEntry: async (reason) => { await statusTransitionMutation.mutateAsync({ toStatus: 'withdrawn', reason }); },
      retry: () => {
        void entriesQuery.refetch();
        if (entryId) void journeyQuery.refetch();
        void teamRosterQuery.refetch();
      },
    }),
    [
      entries,
      entriesQuery,
      entryId,
      openEntry,
      actionError,
      addRosterMember,
      derivation,
      journeyQuery,
      paymentMutation,
      evidenceStatusMutation,
      exportMutation,
      saveEntryMutation,
      proposeRosterChangeMutation,
      selectProduct,
      statusTransitionMutation,
      createTeamMutation,
      selectedFee,
      selectedPartner,
      selectedProduct,
      selectedQuota,
      selectedRule,
      selectedSport,
      liveRuleQuery.isLoading,
      selection,
      resetRoster,
      rosterImpact,
      rosterMembers,
      substituteRosterMember,
      teamRosterQuery.data,
      teamRosterQuery.error,
      teamRosterQuery.isError,
      teamRosterQuery.isLoading,
      teamRosterQuery,
      waitlistMutation,
    ],
  );

  return <RegistrationJourneyContext.Provider value={value}>{children}</RegistrationJourneyContext.Provider>;
}

export function useRegistrationJourney(): RegistrationJourneyContextValue {
  const context = useContext(RegistrationJourneyContext);
  if (!context) {
    throw new Error('useRegistrationJourney must be used within RegistrationJourneyProvider.');
  }
  return context;
}
