import { CalendarDays, Check, Search, Trophy, UserPlus, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useState } from 'react';
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
import { copy } from '@/constants/copy';
import {
  useDisciplineCategories,
  useEvent,
  useEventSports,
  useSportDisciplines,
} from '@/features/events/hooks/useEvents';
import {
  useRegistrationEventId,
  useRegistrationWizard,
} from '@/features/registration/hooks/useRegistrationWizard';
import { useSaveRegistrationDraft } from '@/features/registration/hooks/useRegistration';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

type PartnerOption = 'have' | 'invite' | 'find';

const OPTIONS: Array<{
  id: PartnerOption;
  title: string;
  description: string;
  icon: React.ReactNode;
}> = [
  {
    id: 'have',
    title: copy.partnerHavePartner,
    description: copy.partnerHavePartnerDesc,
    icon: <Users size={22} color={colors.primary} />,
  },
  {
    id: 'invite',
    title: copy.partnerInvite,
    description: copy.partnerInviteDesc,
    icon: <UserPlus size={22} color={colors.primary} />,
  },
  {
    id: 'find',
    title: copy.partnerFind,
    description: copy.partnerFindDesc,
    icon: <Search size={22} color={colors.primary} />,
  },
];

/** A11 — Partner / Team Setup. Select a path, then Continue. */
export default function PartnerSetupScreen() {
  const router = useRouter();
  const eventId = useRegistrationEventId();
  const { draft, isLoading } = useRegistrationWizard(eventId);
  const { data: event } = useEvent(eventId);
  const { data: sports } = useEventSports(eventId);
  const { data: disciplines } = useSportDisciplines(draft?.sportId ?? '');
  const { data: categories } = useDisciplineCategories(draft?.disciplineId ?? '');
  const saveDraft = useSaveRegistrationDraft();
  const selectedCategory = categories?.find((category) => category.id === draft?.categoryId);
  const partnerRequired = selectedCategory?.partnerRequired ?? false;
  const sport = sports?.find((item) => item.id === draft?.sportId);
  const discipline = disciplines?.find((item) => item.id === draft?.disciplineId);
  const [selected, setSelected] = useState<PartnerOption | null>(null);
  const { isWideWeb } = useAppLayout();

  const handleSelect = (option: PartnerOption) => {
    setSelected(option);
  };

  const goFinder = () => {
    if (!eventId || !selected) return;
    router.push({ pathname: '/(registration)/partner-finder', params: { eventId, partnerMode: selected } });
  };

  const handleContinue = () => {
    goFinder();
  };

  const handleSaveAndExit = async () => {
    if (!draft) return;
    await saveDraft.mutateAsync({ ...draft, currentStep: 5, updatedAt: new Date().toISOString() });
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
        <LoadingState />
      </AppScreen>
    );
  }

  if (!draft?.accreditationPhotoUri) {
    return (
      <AppScreen>
        <ErrorState
          title="Accreditation photo required"
          onRetry={() => router.replace({ pathname: '/(registration)/photo', params: { eventId } })}
        />
      </AppScreen>
    );
  }

  const sportLine = [sport?.name, discipline?.name, selectedCategory?.ageGroup].filter(Boolean).join(' · ');

  return (
    <AppScreen className="px-0">
      <RegistrationFormLayout
        currentStep={5}
        header={<AppHeader title={copy.partnerTitle} subtitle={copy.partnerSubtitle} onBack={() => router.back()} />}>
        <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-4" showsVerticalScrollIndicator={false}>
          <GlassSurface className="gap-2 bg-emerald-50 p-4">
            <View className="flex-row items-center gap-2">
              <CalendarDays size={16} color="#047857" />
              <Text className="flex-1 text-sm text-foreground">{event?.name ?? '—'}</Text>
            </View>
            {sportLine ? (
              <View className="flex-row items-center gap-2">
                <Users size={16} color="#047857" />
                <Text className="flex-1 text-sm text-foreground">{sportLine}</Text>
              </View>
            ) : null}
            {selectedCategory?.entryType ? (
              <View className="flex-row items-center gap-2">
                <Trophy size={16} color="#047857" />
                <Text className="flex-1 text-sm capitalize text-foreground">{selectedCategory.entryType}</Text>
              </View>
            ) : null}
          </GlassSurface>

          <Text className="text-sm font-bold text-foreground">{copy.partnerHowContinue}</Text>

          {selected === 'invite' ? (
            <GlassSurface className="p-4">
              <Text className="text-sm leading-5 text-muted-foreground">{copy.partnerInviteSent}</Text>
            </GlassSurface>
          ) : null}

          <View className={cn('gap-3', isWideWeb && 'flex-row flex-wrap justify-between')}>
            {OPTIONS.map((option) => {
              const isSelected = selected === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => handleSelect(option.id)}
                  className={cn('active:scale-[0.99]', isWideWeb && 'w-[31.5%]')}>
                  <GlassSurface
                    className={cn('h-full flex-row items-start gap-3 p-4 hover:border-primary/40', isSelected && 'border-2 border-primary')}>
                    <View className="rounded-xl bg-primary/10 p-3">{option.icon}</View>
                    <View className="flex-1">
                      <Text className="text-base font-semibold text-foreground">{option.title}</Text>
                      <Text className="mt-1 text-sm leading-5 text-muted-foreground">{option.description}</Text>
                    </View>
                    {isSelected ? (
                      <View className="h-6 w-6 items-center justify-center rounded-full bg-primary">
                        <Check size={14} color="#FFFFFF" />
                      </View>
                    ) : null}
                  </GlassSurface>
                </Pressable>
              );
            })}
          </View>

          <GlassSurface className="border-primary/20 bg-primary/5 p-3">
            <Text className="text-xs leading-5 text-primary">{copy.partnerChangeLater}</Text>
          </GlassSurface>
        </ScrollView>
      </RegistrationFormLayout>

      <BottomActionBar constrain>
        {partnerRequired ? (
          <GradientButton className="w-full" disabled={!selected} onPress={handleContinue}>
            {copy.continue}
          </GradientButton>
        ) : (
          <GradientButton
            className="w-full"
            onPress={() => router.push({ pathname: '/(registration)/review', params: { eventId } })}>
            {copy.partnerSkipToReview}
          </GradientButton>
        )}
        <Pressable onPress={handleSaveAndExit} className="items-center py-2 active:opacity-70">
          <Text className="text-sm font-semibold text-primary">{copy.saveAndExit}</Text>
        </Pressable>
      </BottomActionBar>
    </AppScreen>
  );
}
