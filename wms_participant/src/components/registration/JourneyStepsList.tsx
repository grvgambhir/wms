import { View } from 'react-native';

import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { cn } from '@/lib/utils';

const JOURNEY_STEPS = [
  copy.registrationOverviewJourneyCategory,
  copy.registrationOverviewJourneyDocuments,
  copy.registrationOverviewJourneyPartner,
  copy.registrationOverviewJourneyReview,
] as const;

type JourneyStepsListProps = {
  /** 1-based next step to highlight (A06 starts at sport & category). */
  nextStep?: number;
};

/** Vertical upcoming-step list on A06 — distinct from the wizard rail. */
export function JourneyStepsList({ nextStep = 1 }: JourneyStepsListProps) {
  return (
    <View className="gap-3">
      <Text className="text-sm font-bold text-foreground">{copy.registrationOverviewJourney}</Text>
      {JOURNEY_STEPS.map((label, index) => {
        const step = index + 1;
        const isNext = step === nextStep;
        return (
          <View key={label} className="flex-row items-center gap-3">
            <View
              className={cn(
                'h-8 w-8 items-center justify-center rounded-full',
                isNext ? 'bg-primary' : 'bg-slate-100',
              )}>
              <Text className={cn('text-sm font-bold', isNext ? 'text-white' : 'text-muted-foreground')}>
                {step}
              </Text>
            </View>
            <Text className={cn('text-sm font-semibold', isNext ? 'text-primary' : 'text-muted-foreground')}>
              {label}
            </Text>
          </View>
        );
      })}
    </View>
  );
}