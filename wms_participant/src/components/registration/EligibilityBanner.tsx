import { ShieldCheck } from 'lucide-react-native';
import { View } from 'react-native';

import { GlassSurface } from '@/components/ui/glass-surface';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';

type EligibilityBannerProps = {
  eligible: boolean;
  message?: string;
};

/** Mock eligibility result banner for A09. */
export function EligibilityBanner({ eligible, message }: EligibilityBannerProps) {
  return (
    <GlassSurface className="flex-row items-start gap-3 p-4">
      <View className={`rounded-full p-2 ${eligible ? 'bg-emerald-500/15' : 'bg-amber-500/15'}`}>
        <ShieldCheck size={20} color={eligible ? '#047857' : '#B45309'} />
      </View>
      <View className="flex-1">
        <Text className="text-sm font-bold text-foreground">
          {eligible ? copy.eligibilityEligibleTitle : copy.eligibilityReviewTitle}
        </Text>
        <Text className="mt-1 text-sm leading-5 text-muted-foreground">
          {message ?? (eligible ? copy.eligibilityEligibleBody : copy.eligibilityReviewBody)}
        </Text>
      </View>
    </GlassSurface>
  );
}
