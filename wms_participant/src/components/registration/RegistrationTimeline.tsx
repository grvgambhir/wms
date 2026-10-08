import { Check } from 'lucide-react-native';
import { View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import type { RegistrationStatus } from '@/domain/models/registration';

type TimelineStep = {
  status: RegistrationStatus;
  label: string;
  complete: boolean;
  current?: boolean;
};

type RegistrationTimelineProps = {
  currentStatus: RegistrationStatus;
};

const DEMO_STEPS: Array<{ status: RegistrationStatus; label: string }> = [
  { status: 'submitted', label: 'Registration submitted' },
  { status: 'under_review', label: 'Under review' },
  { status: 'approved', label: 'Approved' },
];

function isStepComplete(current: RegistrationStatus, step: RegistrationStatus): boolean {
  const order: RegistrationStatus[] = ['draft', 'submitted', 'under_review', 'approved', 'accreditation_pending', 'accreditation_issued'];
  return order.indexOf(current) >= order.indexOf(step);
}

/** Status progression timeline for A15. */
export function RegistrationTimeline({ currentStatus }: RegistrationTimelineProps) {
  const steps: TimelineStep[] = DEMO_STEPS.map((step) => ({
    ...step,
    complete: isStepComplete(currentStatus, step.status),
    current: currentStatus === step.status,
  }));

  return (
    <GlassSurface className="gap-4 p-4">
      {steps.map((step, index) => (
        <View key={step.status} className="flex-row gap-3">
          <View className="items-center">
            <View
              className={`h-8 w-8 items-center justify-center rounded-full ${
                step.complete ? 'bg-emerald-500' : 'bg-muted'
              }`}>
              {step.complete ? <Check size={16} color="#FFFFFF" /> : null}
            </View>
            {index < steps.length - 1 ? <View className="mt-1 h-8 w-0.5 bg-border" /> : null}
          </View>
          <View className="flex-1 pb-2">
            <Text className={`text-sm font-semibold ${step.complete ? 'text-foreground' : 'text-muted-foreground'}`}>
              {step.label}
            </Text>
            {step.current ? (
              <Text className="mt-0.5 text-xs text-primary">Current status</Text>
            ) : step.complete ? (
              <Text className="mt-0.5 text-xs text-emerald-700">Complete</Text>
            ) : (
              <Text className="mt-0.5 text-xs text-muted-foreground">Pending</Text>
            )}
          </View>
        </View>
      ))}
    </GlassSurface>
  );
}
