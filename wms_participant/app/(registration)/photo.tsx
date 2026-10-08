import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { Camera, Image as ImageIcon, RotateCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { RegistrationFormLayout } from '@/components/registration/RegistrationFormLayout';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { copy } from '@/constants/copy';
import { useAthleteProfile } from '@/features/athlete/hooks/useAthlete';
import { useSaveRegistrationDraft } from '@/features/registration/hooks/useRegistration';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import { useAppLayout } from '@/hooks/useAppLayout';
import { resolvePhotoSource, toAssetPhotoRef } from '@/lib/photo';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

const PHOTO_GUIDES = [
  copy.photoGuideRecent,
  copy.photoGuideBackground,
  copy.photoGuideFace,
  copy.photoGuideNoHats,
] as const;

/** A10 — Accreditation Photo (picker crop + preview overlay; rotate is display-only). */
export default function PhotoScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId();
  const { draft, isLoading } = useRegistrationWizard(eventId);
  const { data: profile } = useAthleteProfile();
  const saveDraft = useSaveRegistrationDraft();
  const { showToast } = useToast();
  const [photoUri, setPhotoUri] = useState<string | undefined>(draft?.accreditationPhotoUri);
  const [picking, setPicking] = useState(false);
  const [rotation, setRotation] = useState(0);
  const { isWideWeb } = useAppLayout();

  useEffect(() => {
    if (photoUri) return;
    if (draft?.accreditationPhotoUri) {
      setPhotoUri(draft.accreditationPhotoUri);
      return;
    }
    if (profile?.profileImageUri) {
      setPhotoUri(profile.profileImageUri);
      return;
    }
    if (profile?.profileImageKey) {
      setPhotoUri(toAssetPhotoRef(profile.profileImageKey));
    }
  }, [draft?.accreditationPhotoUri, photoUri, profile?.profileImageKey, profile?.profileImageUri]);

  const pickImage = async (source: 'library' | 'camera') => {
    setPicking(true);
    try {
      if (source === 'camera') {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) return;
      }

      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync({
              allowsEditing: true,
              aspect: [3, 4],
              quality: 0.85,
            })
          : await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              aspect: [3, 4],
              quality: 0.85,
            });

      if (!result.canceled && result.assets[0]?.uri) {
        setPhotoUri(result.assets[0].uri);
        setRotation(0);
        showToast({
          title: copy.toastPhotoSaved,
          description: copy.toastPhotoSavedBody,
          variant: 'success',
        });
      }
    } finally {
      setPicking(false);
    }
  };

  const persistPhoto = async (nextStep: number) => {
    if (!draft || !eventId || !photoUri) return;
    await saveDraft.mutateAsync({
      ...draft,
      accreditationPhotoUri: photoUri,
      currentStep: nextStep,
      updatedAt: new Date().toISOString(),
    });
  };

  const handleContinue = async () => {
    await persistPhoto(5);
    router.push({ pathname: '/(registration)/partner', params: { eventId } });
  };

  const handleSaveAndExit = async () => {
    await persistPhoto(4);
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

  if (isLoading) {
    return (
      <AppScreen>
        <LoadingState message="Loading…" />
      </AppScreen>
    );
  }

  if (!draft?.documentIds?.length) {
    return (
      <AppScreen>
        <ErrorState
          title="Documents required"
          onRetry={() => router.replace({ pathname: '/(registration)/documents', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  const sourceButtons = (
    <View className="w-full flex-row gap-2">
      <Pressable
        disabled={picking}
        onPress={() => pickImage('camera')}
        className="flex-1 items-center gap-1 rounded-xl border border-border bg-white py-3 hover:bg-primary/5 active:opacity-80">
        <Camera size={20} color={colors.primary} />
        <Text className="text-xs font-semibold text-foreground">{copy.photoTakePhoto}</Text>
      </Pressable>
      <Pressable
        disabled={picking}
        onPress={() => pickImage('library')}
        className="flex-1 items-center gap-1 rounded-xl border border-border bg-white py-3 hover:bg-primary/5 active:opacity-80">
        <ImageIcon size={20} color={colors.primary} />
        <Text className="text-xs font-semibold text-foreground">{copy.photoChooseGallery}</Text>
      </Pressable>
      <Pressable
        disabled={!photoUri}
        onPress={() => setRotation((value) => value + 90)}
        className="flex-1 items-center gap-1 rounded-xl border border-border bg-white py-3 hover:bg-primary/5 active:opacity-80">
        <RotateCw size={20} color={colors.primary} />
        <Text className="text-xs font-semibold text-foreground">{copy.photoRotate}</Text>
      </Pressable>
    </View>
  );

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        currentStep={4}
        header={<AppHeader title={copy.photoTitle} subtitle={copy.photoSubtitle} onBack={() => router.back()} />}>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <View className={cn('flex-row flex-wrap gap-2', isWideWeb && 'justify-between')}>
            {PHOTO_GUIDES.map((guide) => (
              <View
                key={guide}
                className={cn(
                  'rounded-xl border border-border bg-white px-3 py-2',
                  isWideWeb ? 'w-[23%]' : 'w-[48%]',
                )}>
                <Text className="text-center text-xs font-semibold text-foreground">{guide}</Text>
              </View>
            ))}
          </View>

          <View className={cn('gap-4', isWideWeb && 'flex-row items-start')}>
            <GlassSurface className={cn('items-center gap-4 p-5', isWideWeb && 'flex-1')}>
              {/* Portrait 3:4 frame — landscape h-72 + cover cropped the headshot to a mid-face strip. */}
              <View
                className="w-full max-w-[320px] self-center overflow-hidden rounded-2xl bg-slate-200"
                style={{ aspectRatio: 3 / 4 }}>
                {resolvePhotoSource(photoUri) ? (
                  <View className="flex-1">
                    <Image
                      source={resolvePhotoSource(photoUri)}
                      style={{ width: '100%', height: '100%', transform: [{ rotate: `${rotation}deg` }] }}
                      contentFit="contain"
                    />
                    <View pointerEvents="none" className="absolute inset-2 rounded-md border-2 border-white">
                      <View className="absolute left-1/3 top-0 h-full w-px bg-white/50" />
                      <View className="absolute left-2/3 top-0 h-full w-px bg-white/50" />
                      <View className="absolute left-0 top-1/3 h-px w-full bg-white/50" />
                      <View className="absolute left-0 top-2/3 h-px w-full bg-white/50" />
                    </View>
                  </View>
                ) : (
                  <View className="flex-1 items-center justify-center px-6">
                    <Text className="text-center text-sm text-muted-foreground">{copy.photoGuidance}</Text>
                  </View>
                )}
              </View>
              {sourceButtons}
            </GlassSurface>
          </View>
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        <GradientButton className="w-full" disabled={!photoUri || saveDraft.isPending} onPress={handleContinue}>
          {copy.photoUsePhoto}
        </GradientButton>
        <Pressable
          onPress={handleSaveAndExit}
          disabled={!photoUri || saveDraft.isPending}
          className="items-center py-2 active:opacity-70">
          <Text className={cn('text-sm font-semibold text-primary', (!photoUri || saveDraft.isPending) && 'opacity-40')}>
            {copy.saveAndExit}
          </Text>
        </Pressable>
      </BottomActionBar>
    </AppScreen>
  );
}
