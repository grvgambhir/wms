import { Link, useRouter, type Href } from 'expo-router';
import { View } from 'react-native';

import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { Button } from '@/components/ui/button';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import type { ScreenId } from '@/constants/screens';
import { getNextFlowRoute } from '@/constants/screens';

type ScreenStubProps = {
  screenId: ScreenId;
  title: string;
  subtitle?: string;
  /** Override auto next-route from POC_FLOW_NEXT. */
  nextHref?: Href;
  nextLabel?: string;
  showBack?: boolean;
};

/** Placeholder shell for Phase 3 route stubs — replaced in Batch 1–4. */
export function ScreenStub({
  screenId,
  title,
  subtitle,
  nextHref,
  nextLabel = 'Continue demo path',
  showBack = true,
}: ScreenStubProps) {
  const router = useRouter();
  const resolvedNext = (nextHref ?? getNextFlowRoute(screenId)) as Href | undefined;

  return (
    <AppScreen>
      <AppHeader
        title={title}
        subtitle={subtitle ?? `${screenId} · Navigation stub`}
        onBack={showBack ? () => router.back() : undefined}
      />
      <GlassSurface className="p-5">
        <Text className="text-xs font-bold uppercase tracking-[2px] text-primary">{screenId}</Text>
        <Text className="mt-2 text-base leading-6 text-muted-foreground">
          Route is wired. Full UI and repository integration land in the screen batch for this step.
        </Text>
        {resolvedNext ? (
          <Link href={resolvedNext} asChild>
            <GradientButton className="mt-6 w-full">{nextLabel}</GradientButton>
          </Link>
        ) : null}
        <Link href="/(dev)/flow-map" asChild>
          <Button variant="outline" className="mt-3 w-full">
            <Text>All screens (flow map)</Text>
          </Button>
        </Link>
      </GlassSurface>
      <View className="mt-4 rounded-xl border border-dashed border-primary/30 p-4">
        <Text className="text-center text-xs text-muted-foreground">Phase 3 navigation skeleton</Text>
      </View>
    </AppScreen>
  );
}
