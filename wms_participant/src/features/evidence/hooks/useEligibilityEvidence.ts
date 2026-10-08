import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { repositories } from '@/data/providers/repositories';
import { newIdempotencyKey } from '@/features/profile/completeProfile';
import type { PaginatedResponse } from '@/domain/models/api';
import type { EligibilityEvidence } from '@/domain/models/evidence';
import type { RestrictedEvidence } from '@/domain/models/restrictedEvidence';

type EvidenceScope = {
  registrationEntryId?: string;
  sportEntryProductId?: string;
  enabled: boolean;
};

export function useEligibilityEvidence(scope: EvidenceScope) {
  const queryClient = useQueryClient();
  const ordinaryKey = ['eligibility-evidence', scope.registrationEntryId, scope.sportEntryProductId] as const;
  const restrictedKey = ['restricted-evidence', scope.registrationEntryId, scope.sportEntryProductId] as const;
  const request = {
    registrationEntryId: scope.registrationEntryId ?? '',
    sportEntryProductId: scope.sportEntryProductId ?? '',
  };

  const ordinary = useQuery({
    queryKey: ordinaryKey,
    queryFn: () => repositories.evidence.list(request),
    enabled: scope.enabled && Boolean(scope.registrationEntryId && scope.sportEntryProductId),
  });
  const restricted = useQuery({
    queryKey: restrictedKey,
    queryFn: () => repositories.restrictedEvidence.list(request),
    enabled: scope.enabled && Boolean(scope.registrationEntryId && scope.sportEntryProductId),
  });

  const updateOrdinary = (item: EligibilityEvidence) => {
    queryClient.setQueryData<PaginatedResponse<EligibilityEvidence>>(ordinaryKey, (current) =>
      current ? { ...current, items: current.items.map((candidate) => candidate.id === item.id ? item : candidate) } : current,
    );
  };
  const updateRestricted = (item: RestrictedEvidence) => {
    queryClient.setQueryData<PaginatedResponse<RestrictedEvidence>>(restrictedKey, (current) =>
      current ? { ...current, items: current.items.map((candidate) => candidate.id === item.id ? item : candidate) } : current,
    );
  };

  const uploadRestricted = useMutation({
    mutationFn: (evidenceId: string) => repositories.restrictedEvidence.upload({
      evidenceId,
      fileName: `Daniel_Harper_evidence_${evidenceId.slice(-4)}.pdf`,
      mimeType: 'application/pdf',
      fileSizeBytes: 384512,
      idempotencyKey: newIdempotencyKey(),
    }),
    onSuccess: (response) => updateRestricted(response.item),
  });
  const uploadOrdinary = useMutation({
    mutationFn: ({ evidenceId, declaredAttribute }: { evidenceId: string; declaredAttribute?: { attribute: 'weight_kg' | 'belt_rank' | 'federation_licence'; numericValue?: number; textValue?: string; validUntil?: string } }) =>
      repositories.evidence.upload({
        evidenceId,
        fileName: `Judo_evidence_${evidenceId.slice(-4)}.pdf`,
        mimeType: 'application/pdf',
        fileSizeBytes: 384512,
        idempotencyKey: newIdempotencyKey(),
        declaredAttribute,
      }),
    onSuccess: (response) => updateOrdinary(response.item),
  });
  const reviewRestricted = useMutation({
    mutationFn: (evidenceId: string) => repositories.restrictedEvidence.startReview({
      evidenceId,
      idempotencyKey: newIdempotencyKey(),
    }),
    onSuccess: (response) => updateRestricted(response.item),
  });
  const decideRestricted = useMutation({
    mutationFn: ({ evidenceId, decision }: { evidenceId: string; decision: 'approved' | 'rejected' }) =>
      repositories.restrictedEvidence.decide({
        evidenceId,
        decision,
        reason: decision === 'rejected' ? 'The submitted file is not legible.' : undefined,
        idempotencyKey: newIdempotencyKey(),
      }),
    onSuccess: (response) => updateRestricted(response.item),
  });

  const actionError = [uploadRestricted.error, uploadOrdinary.error, reviewRestricted.error, decideRestricted.error]
    .find((error): error is Error => error instanceof Error) ?? null;

  return {
    ordinary,
    restricted,
    isLoading: ordinary.isLoading || restricted.isLoading,
    isError: ordinary.isError || restricted.isError,
    error: ordinary.error ?? restricted.error,
    isActionPending: uploadRestricted.isPending || uploadOrdinary.isPending || reviewRestricted.isPending || decideRestricted.isPending,
    actionError,
    uploadRestricted: uploadRestricted.mutateAsync,
    uploadOrdinary: uploadOrdinary.mutateAsync,
    reviewRestricted: reviewRestricted.mutateAsync,
    decideRestricted: decideRestricted.mutateAsync,
    refresh: async () => { await Promise.all([ordinary.refetch(), restricted.refetch()]); },
    updateOrdinary,
  };
}
