import { useLocalSearchParams, useRouter } from 'expo-router';
import { ArrowLeft, Share2 } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { LiveResultCard } from '@/components/gameshub/LiveResultCard';
import { AppChrome } from '@/components/shell/AppChrome';
import { AppScreen } from '@/components/shell/AppScreen';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { WebPageLayout } from '@/components/shell/WebPageLayout';
import { Text } from '@/components/ui/text';
import { DEMO_IDS } from '@/constants/demo';
import { copy } from '@/constants/copy';
import { useLiveMatch } from '@/features/results/hooks/useResults';
import { cn } from '@/lib/utils';
import { gradients } from '@/theme/gradients';
import { LinearGradient } from 'expo-linear-gradient';

/** A18 — Live match / result (read-only mock feed). */
export default function LiveMatchScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const matchId = id ?? DEMO_IDS.matchTennisDemo;
  const { match, isLoading, isError } = useLiveMatch(matchId);

  if (isLoading && !match) {
    return (
      <AppScreen>
        <LoadingState message="Connecting to match feed…" />
      </AppScreen>
    );
  }

  if (isError || !match) {
    return (
      <AppScreen>
        <ErrorState title="Match not found" onRetry={() => router.back()} />
      </AppScreen>
    );
  }

  const statusLabel = match.status === 'live' ? 'LIVE' : match.status === 'completed' ? 'FINAL' : 'SCHEDULED';

  return (
    <AppScreen className="px-0">
      <AppChrome active="home">
        <WebPageLayout>
          <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8" showsVerticalScrollIndicator={false}>
            <View className="overflow-hidden rounded-2xl">
              <LinearGradient colors={[...gradients.hero]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ padding: 16 }}>
                <View className="flex-row items-center justify-between">
                  <Pressable
                    onPress={() => router.back()}
                    className="h-10 w-10 items-center justify-center rounded-full bg-white/15 active:opacity-80"
                    accessibilityRole="button"
                    accessibilityLabel="Go back">
                    <ArrowLeft size={20} color="#FFFFFF" />
                  </Pressable>
                  <Text className="flex-1 text-center text-base font-bold text-white">{copy.liveMatchTitle}</Text>
                  <Pressable
                    onPress={() => Alert.alert(copy.liveMatchShare, copy.liveMatchShareStub)}
                    className="h-10 w-10 items-center justify-center rounded-full bg-white/15 active:opacity-80"
                    accessibilityRole="button"
                    accessibilityLabel={copy.liveMatchShare}>
                    <Share2 size={18} color="#FFFFFF" />
                  </Pressable>
                </View>

                <View className="mt-4 flex-row flex-wrap items-center gap-2">
                  <View className={cn('rounded-full px-2.5 py-1', match.status === 'live' ? 'bg-emerald-500' : 'bg-white/20')}>
                    <Text className="text-[10px] font-bold uppercase text-white">{statusLabel}</Text>
                  </View>
                  <Text className="text-sm text-white/90">{match.court}</Text>
                </View>
                <Text className="mt-2 text-sm text-white/80">
                  {match.round ? `${match.round} · ` : ''}
                  {copy.liveMatchSubtitle}
                </Text>
              </LinearGradient>
            </View>

            <LiveResultCard match={match} />

            <View className="rounded-xl bg-primary/5 px-4 py-3">
              <Text className="text-center text-xs text-muted-foreground">{copy.liveMatchDemoHint}</Text>
            </View>
          </ScrollView>
        </WebPageLayout>
      </AppChrome>
    </AppScreen>
  );
}