// Legacy A07 account profile. Moved off `/profile` so Como P06 can own that URL
// (`app/(participant)/profile.tsx` → http://localhost:8081/profile).
import { zodResolver } from '@hookform/resolvers/zod';
import { Image } from 'expo-image';
import { LogOut } from 'lucide-react-native';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { ScrollView, View } from 'react-native';

import { AthleteProfileForm } from '@/components/athlete/AthleteProfileForm';
import { DocumentCard } from '@/components/registration/DocumentCard';
import { AppChrome } from '@/components/shell/AppChrome';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { LoadingState } from '@/components/shell/LoadingState';
import { PageCtaPanel } from '@/components/shell/PageCtaPanel';
import { ScreenHero } from '@/components/shell/ScreenHero';
import { SplitPageLayout } from '@/components/shell/SplitPageLayout';
import { WebPageLayout } from '@/components/shell/WebPageLayout';
import { Button } from '@/components/ui/button';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { copy } from '@/constants/copy';
import { useAthleteProfile, useSaveAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import { profileSchema, type ProfileFormValues } from '@/features/athlete/schemas/profileSchema';
import { formToProfileInput, profileToForm } from '@/features/athlete/utils/profileForm';
import { useAthleteDocuments } from '@/features/documents/hooks/useDocuments';
import { useAuthSession, useSignOut } from '@/features/auth/hooks/useAuth';
import { useHiddenRegistrationResetGesture } from '@/features/demo/hooks/useResetRegistrationDemo';
import { resolvePhotoSource, toAssetPhotoRef } from '@/lib/photo';

const DOCUMENT_LABELS: Record<string, string> = {
  passport_id: 'Passport or national ID',
  dob_proof: 'Date of birth proof',
  medical_declaration: 'Medical declaration',
  liability_waiver: 'Liability waiver',
  other: 'Other document',
};

/** Account Profile tab — one-time athlete identity (not part of event registration). */
export default function AccountProfileScreen() {
  const { data: session } = useAuthSession();
  const { data: profile, isLoading } = useAthleteProfile();
  const { data: documents } = useAthleteDocuments(profile?.id ?? session?.athleteId ?? '');
  const saveProfile = useSaveAthleteProfile();
  const signOut = useSignOut();
  const { showToast } = useToast();
  const handleHiddenResetGesture = useHiddenRegistrationResetGesture();

  const {
    control,
    handleSubmit,
    reset,
    formState: { errors, isValid },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    mode: 'onChange',
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      gender: '',
      nationalityCountryCode: '',
      email: '',
      phone: '',
      passportNumber: '',
      emergencyContactName: '',
      emergencyContactPhone: '',
      emergencyContactRelationship: '',
    },
  });

  useEffect(() => {
    if (profile) {
      reset(profileToForm(profile));
    }
  }, [profile, reset]);

  const handleLogout = async () => {
    await signOut.mutateAsync();
    showToast({
      title: copy.toastSignedOut,
      description: copy.toastSignedOutBody,
      variant: 'info',
    });
  };

  const onSave = async (values: ProfileFormValues) => {
    try {
      await saveProfile.mutateAsync(formToProfileInput(values, profile?.id));
      showToast({
        title: copy.toastProfileSaved,
        description: copy.toastProfileSavedBody,
        variant: 'success',
      });
    } catch {
      showToast({
        title: copy.toastProfileSaveError,
        description: copy.toastProfileSaveErrorBody,
        variant: 'error',
      });
    }
  };

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState message={copy.accountLoading} />
      </AppScreen>
    );
  }

  const photoSource = resolvePhotoSource(
    profile?.profileImageUri ?? (profile?.profileImageKey ? toAssetPhotoRef(profile.profileImageKey) : undefined),
  );

  return (
    <AppScreen className="px-0">
      <AppChrome
        active="profile"
        footer={
          <BottomActionBar constrain flush>
            <GradientButton
              className="w-full"
              disabled={!isValid || saveProfile.isPending}
              onPress={handleSubmit(onSave)}>
              {saveProfile.isPending ? copy.profileSaving : copy.accountSave}
            </GradientButton>
          </BottomActionBar>
        }>
        <WebPageLayout>
          <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
            <ScreenHero eyebrow={copy.appName} title={copy.accountTitle} subtitle={copy.accountSubtitle} />

            <SplitPageLayout
              main={
                <View className="gap-4">
                  <Text className="text-sm text-muted-foreground">{copy.profileIntroHint}</Text>
                  <AthleteProfileForm control={control} errors={errors} emailLocked />
                </View>
              }
              rail={
                <>
                  <GlassSurface className="items-center gap-3 p-5">
                    <Text className="self-start text-sm font-bold text-primary">{copy.accountPhotoTitle}</Text>
                    <View className="h-40 w-32 overflow-hidden rounded-2xl bg-primary/10">
                      {photoSource ? (
                        <Image source={photoSource} style={{ width: '100%', height: '100%' }} contentFit="cover" />
                      ) : (
                        <View className="flex-1 items-center justify-center px-2">
                          <Text className="text-center text-xs text-muted-foreground">{copy.accountPhotoEmpty}</Text>
                        </View>
                      )}
                    </View>
                    <Text className="text-center text-xs text-muted-foreground">{copy.accountPhotoHint}</Text>
                  </GlassSurface>

                  {documents?.length ? (
                    <View className="gap-2">
                      <Text className="text-sm font-bold text-primary">{copy.accountDocumentsTitle}</Text>
                      {documents.map((document) => (
                        <DocumentCard
                          key={document.id}
                          label={DOCUMENT_LABELS[document.type] ?? document.type}
                          status={document.status}
                          fileName={document.fileName}
                          uploadedAt={document.uploadedAt}
                        />
                      ))}
                    </View>
                  ) : (
                    <Text className="text-sm text-muted-foreground">{copy.accountDocumentsEmpty}</Text>
                  )}

                  <PageCtaPanel
                    title={copy.accountActionsTitle}
                    description={copy.accountRegistrationHint}
                    onDescriptionPress={handleHiddenResetGesture}
                    action={
                      <Button
                        variant="outline"
                        className="h-12 w-full rounded-xl border-destructive/30"
                        disabled={signOut.isPending}
                        onPress={handleLogout}>
                        <LogOut size={18} color="#DC2626" />
                        <Text className="text-base font-semibold text-destructive">
                          {signOut.isPending ? copy.accountLoggingOut : copy.accountLogout}
                        </Text>
                      </Button>
                    }
                  />
                </>
              }
            />
          </ScrollView>
        </WebPageLayout>
      </AppChrome>
    </AppScreen>
  );
}
