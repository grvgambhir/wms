import * as DocumentPicker from 'expo-document-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { CloudUpload } from 'lucide-react-native';
import { Pressable, ScrollView, View } from 'react-native';

import { DocumentCard } from '@/components/registration/DocumentCard';
import { EligibilityBanner } from '@/components/registration/EligibilityBanner';
import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { ResponsiveGrid } from '@/components/shell/ResponsiveGrid';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { copy } from '@/constants/copy';
import { useAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import {
  useAthleteDocuments,
  useDocumentRequirements,
  useSaveDocument,
} from '@/features/documents/hooks/useDocuments';
import { useDisciplineCategories } from '@/features/events/hooks/useEvents';
import {
  useSaveRegistrationDraft,
} from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import type { DocumentType, EligibilityDocument } from '@/domain/models/document';
import { calculateAge, isAgeInGroup } from '@/lib/eligibility';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

const DOCUMENT_HINTS: Partial<Record<DocumentType, string>> = {
  passport_id: copy.documentsHintPassport,
  dob_proof: copy.documentsHintDob,
  medical_declaration: copy.documentsHintMedical,
  liability_waiver: copy.documentsHintWaiver,
};

/** A09 — Eligibility & Documents. */
export default function DocumentsScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId();
  const { draft, isLoading } = useRegistrationWizard(eventId);
  const { data: profile } = useAthleteProfile();
  const athleteId = draft?.athleteId ?? profile?.id ?? '';
  const { data: requirements, isLoading: requirementsLoading } = useDocumentRequirements(eventId);
  const { data: documents, isLoading: documentsLoading } = useAthleteDocuments(athleteId);
  const { data: categories } = useDisciplineCategories(draft?.disciplineId ?? '');
  const saveDocument = useSaveDocument();
  const saveDraft = useSaveRegistrationDraft();
  const { showToast } = useToast();
  const [uploadingType, setUploadingType] = useState<DocumentType | null>(null);
  const { isWideWeb } = useAppLayout();

  const selectedCategory = categories?.find((category) => category.id === draft?.categoryId);
  const age = profile?.dateOfBirth ? calculateAge(profile.dateOfBirth) : null;
  const eligible = selectedCategory ? isAgeInGroup(age, selectedCategory.ageGroup) : Boolean(profile?.dateOfBirth);

  const documentsByType = useMemo(() => {
    const map = new Map<DocumentType, EligibilityDocument>();
    documents?.forEach((document) => map.set(document.type, document));
    return map;
  }, [documents]);

  const requiredComplete = useMemo(() => {
    if (!requirements?.length) return false;
    return requirements
      .filter((requirement) => requirement.required)
      .every((requirement) => {
        const doc = documentsByType.get(requirement.type);
        return doc?.status === 'uploaded' || doc?.status === 'verified';
      });
  }, [documentsByType, requirements]);

  const handleUpload = async (type: DocumentType, label: string) => {
    if (!athleteId) return;

    setUploadingType(type);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: '*/*',
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const documentId = `doc_${athleteId}_${type}`;

      await saveDocument.mutateAsync({
        id: documentId,
        athleteId,
        registrationDraftId: draft?.id,
        type,
        fileName: asset.name ?? `${label}.pdf`,
        localUri: asset.uri,
        status: 'uploaded',
      });
      showToast({
        title: copy.toastDocumentUploaded,
        description: label,
        variant: 'success',
      });
    } catch {
      showToast({
        title: copy.toastDocumentUploadError,
        description: copy.toastDocumentUploadErrorBody,
        variant: 'error',
      });
    } finally {
      setUploadingType(null);
    }
  };

  const collectedDocumentIds = () =>
    [
      ...(requirements
        ?.map((requirement) => documentsByType.get(requirement.type)?.id)
        .filter((id): id is string => Boolean(id)) ?? []),
      documentsByType.get('other')?.id,
    ].filter((id): id is string => Boolean(id));

  const handleContinue = async () => {
    if (!draft || !eventId) return;

    const documentIds = collectedDocumentIds();
    if (!documentIds.length) return;

    await saveDraft.mutateAsync({
      ...draft,
      documentIds,
      currentStep: 4,
      updatedAt: new Date().toISOString(),
    });

    router.push({
      pathname: '/(registration)/photo',
      params: { eventId },
    });
  };

  const handleSaveAndExit = async () => {
    if (!draft || !eventId) return;
    await saveDraft.mutateAsync({
      ...draft,
      documentIds: collectedDocumentIds(),
      currentStep: 3,
      updatedAt: new Date().toISOString(),
    });
    showToast({
      title: copy.toastDraftSaved,
      description: copy.toastDraftSavedBody,
      variant: 'info',
    });
    router.replace('/(registration)');
  };

  if (!eventId) {
    return (
      <AppScreen>
        <ErrorState title="No event selected" />
      </AppScreen>
    );
  }

  if (isLoading || requirementsLoading || documentsLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading documents…" />
      </AppScreen>
    );
  }

  if (!draft?.categoryId) {
    return (
      <AppScreen>
        <ErrorState
          title="Category not selected"
          onRetry={() => router.replace({ pathname: '/(registration)/category', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        currentStep={3}
        header={
          <AppHeader title={copy.documentsTitle} subtitle={copy.documentsSubtitle} onBack={() => router.back()} />
        }>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <EligibilityBanner eligible={eligible} />

          <Text className="text-sm font-bold text-foreground">{copy.documentsRequiredHeading}</Text>

          <ResponsiveGrid columns={isWideWeb ? 2 : 1}>
            {requirements?.map((requirement) => {
              const existing = documentsByType.get(requirement.type);
              return (
                <DocumentCard
                  key={requirement.type}
                  label={requirement.label}
                  hint={DOCUMENT_HINTS[requirement.type]}
                  required={requirement.required}
                  status={existing?.status ?? 'missing'}
                  fileName={existing?.fileName}
                  uploadedAt={existing?.uploadedAt}
                  uploading={uploadingType === requirement.type}
                  onUpload={() => handleUpload(requirement.type, requirement.label)}
                />
              );
            })}
          </ResponsiveGrid>

          <Pressable
            onPress={() => handleUpload('other', copy.documentsOptionalTitle)}
            className="active:opacity-80 hover:border-primary/40">
            <View className="flex-row items-center gap-3 rounded-2xl border border-dashed border-primary/40 bg-primary/5 px-4 py-4">
              <CloudUpload size={22} color={colors.primary} />
              <View className="flex-1">
                <Text className="text-sm font-semibold text-primary">{copy.documentsOptionalTitle}</Text>
                <Text className="mt-0.5 text-xs text-muted-foreground">{copy.documentsOptionalHint}</Text>
                {documentsByType.get('other')?.fileName ? (
                  <Text className="mt-1 text-xs font-medium text-foreground">
                    {documentsByType.get('other')?.fileName}
                  </Text>
                ) : null}
              </View>
            </View>
          </Pressable>

          <Text className="text-xs text-muted-foreground">{copy.documentsRequiredHint}</Text>
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        <GradientButton
          className="w-full"
          disabled={!requiredComplete || saveDraft.isPending}
          onPress={handleContinue}>
          {copy.continue}
        </GradientButton>
        <Pressable
          onPress={handleSaveAndExit}
          disabled={saveDraft.isPending}
          className="items-center py-2 active:opacity-70">
          <Text className={cn('text-sm font-semibold text-primary', saveDraft.isPending && 'opacity-40')}>
            {copy.saveAndExit}
          </Text>
        </Pressable>
      </BottomActionBar>
    </AppScreen>
  );
}
