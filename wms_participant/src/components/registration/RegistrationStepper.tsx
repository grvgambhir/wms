import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { Progress } from '@/components/ui/progress';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { glass } from '@/theme/glass';

export const REGISTRATION_STEPS = [
  'Overview',
  'Category',
  'Documents',
  'Photo',
  'Partner',
  'Review',
  'Payment',
] as const;

type RegistrationStepperProps = {
  currentStep: number;
  totalSteps?: number;
  /** Vertical list on wide-web wizard rail; horizontal bar on compact. */
  orientation?: 'horizontal' | 'vertical';
  className?: string;
};

/** Registration progress — compact bar or website step rail. */
export function RegistrationStepper({
  currentStep,
  totalSteps = REGISTRATION_STEPS.length,
  orientation = 'horizontal',
  className,
}: RegistrationStepperProps) {
  const safeStep = Math.min(Math.max(currentStep, 1), totalSteps);
  const progressValue = (safeStep / totalSteps) * 100;
  const label = REGISTRATION_STEPS[safeStep - 1] ?? `Step ${safeStep}`;

  if (orientation === 'vertical') {
    return (
      <View className={cn('gap-1 rounded-2xl border border-white/50 bg-white/70 p-4', className)}>
        <Text className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Step {safeStep} of {totalSteps}
        </Text>
        {REGISTRATION_STEPS.slice(0, totalSteps).map((stepLabel, index) => {
          const step = index + 1;
          const done = step < safeStep;
          const active = step === safeStep;
          return (
            <View key={stepLabel} className="flex-row items-center gap-3 py-2">
              <View
                className={cn(
                  'h-8 w-8 items-center justify-center rounded-full',
                  done || active ? 'bg-primary' : 'bg-slate-100',
                )}>
                {done ? (
                  <Check size={14} color="#FFFFFF" />
                ) : (
                  <Text className={cn('text-sm font-bold', active ? 'text-white' : 'text-muted-foreground')}>
                    {step}
                  </Text>
                )}
              </View>
              <Text
                className={cn(
                  'flex-1 text-sm',
                  active ? 'font-bold text-primary' : done ? 'font-semibold text-foreground' : 'text-muted-foreground',
                )}>
                {stepLabel}
              </Text>
            </View>
          );
        })}
      </View>
    );
  }

  return (
    <View
      className={cn('gap-3 rounded-2xl border border-white/50 bg-white/60 p-4', className)}
      style={{
        shadowColor: glass.shadow,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 1,
        shadowRadius: 12,
      }}>
      <View className="flex-row items-center justify-between">
        <Text className="text-sm font-medium text-muted-foreground">
          Step {safeStep} of {totalSteps}
        </Text>
        <Text className="text-sm font-bold text-primary">{label}</Text>
      </View>
      <Progress value={progressValue} className="h-2.5 bg-primary/15" indicatorClassName="bg-primary" />
    </View>
  );
}
