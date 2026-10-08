// P06 profile & consent hooks. Cognito sessions load/save via GET/PATCH /v1/me.
// Demo POC still uses the athlete + consent mocks. Swap point for consents
// remains src/data/providers/repositories.ts (§6.6).
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { fetchMe, patchMeProfile, type MeProfile } from '@/auth/me';
import { isDemoSession, readSession } from '@/auth/session';
import { repositories } from '@/data/providers/repositories';
import type { AthleteProfile, AthleteProfileInput } from '@/domain/models/athlete';
import { COMO_DEMO_PARTICIPANT_ID, type ConsentActionRequest } from '@/domain/models/consent';
import { useAuthSession } from '@/features/auth/hooks/useAuth';
import {
  athleteInputToCompleteValues,
  buildProfilePatch,
  createIdempotencyTracker,
  meToAthleteProfile,
} from '@/features/profile/completeProfile';
import { useLocale } from '@/i18n';

const ME_PROFILE_KEY = ['auth', 'me'] as const;
const CONSENTS_KEY = ['consents'] as const;

function profileQueryKey(athleteId: string | undefined, demo: boolean) {
  return ['athlete', 'profile', demo ? (athleteId ?? 'demo') : 'me'] as const;
}

async function loadParticipantProfile(): Promise<AthleteProfile> {
  const session = await readSession();
  if (session && isDemoSession(session)) {
    const hub = await repositories.athlete.getProfile(COMO_DEMO_PARTICIPANT_ID);
    if (!hub) {
      throw new Error('Participant profile was not found.');
    }
    return hub;
  }
  return meToAthleteProfile(await fetchMe());
}

/** GET /v1/me for Cognito; mock athlete for the demo session. */
export function useParticipantProfile() {
  const { data: session, isLoading: sessionLoading } = useAuthSession();
  const demo = !!session && isDemoSession(session);
  const query = useQuery({
    queryKey: profileQueryKey(session?.athleteId, demo),
    queryFn: loadParticipantProfile,
    enabled: !sessionLoading && Boolean(session),
    staleTime: 10_000,
  });
  return {
    ...query,
    isLoading: sessionLoading || query.isLoading,
  };
}

/** PATCH /v1/me/profile for Cognito; mock athlete PUT for demo. */
export function useUpdateParticipantProfile() {
  const queryClient = useQueryClient();
  const { data: session } = useAuthSession();
  const { locale } = useLocale();
  const trackerRef = useRef(createIdempotencyTracker());

  return useMutation({
    mutationFn: async (input: AthleteProfileInput) => {
      if (session && isDemoSession(session)) {
        return repositories.athlete.updateProfile(input);
      }
      const existing = queryClient.getQueryData<MeProfile>(ME_PROFILE_KEY);
      const payload = buildProfilePatch(athleteInputToCompleteValues(input, existing), locale);
      const me = await patchMeProfile(payload, trackerRef.current.keyFor(payload));
      return meToAthleteProfile(me);
    },
    onSuccess: (profile) => {
      queryClient.setQueryData(profileQueryKey(session?.athleteId, !!session && isDemoSession(session)), profile);
      void queryClient.invalidateQueries({ queryKey: ME_PROFILE_KEY });
      void queryClient.invalidateQueries({ queryKey: ['athlete'] });
    },
  });
}

/** GET /participants/{id}/consents */
export function useParticipantConsents(participantId: string | undefined) {
  return useQuery({
    queryKey: [...CONSENTS_KEY, participantId ?? 'none'],
    queryFn: () => repositories.consents.getConsents(participantId ?? COMO_DEMO_PARTICIPANT_ID),
    enabled: Boolean(participantId),
    staleTime: 10_000,
  });
}

export function useGrantConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConsentActionRequest) => repositories.consents.grantConsent(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CONSENTS_KEY }),
  });
}

export function useWithdrawConsent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: ConsentActionRequest) => repositories.consents.withdrawConsent(input),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: CONSENTS_KEY }),
  });
}
