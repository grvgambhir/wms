import { Link, type Href } from 'expo-router';
import { Alert, ScrollView, View } from 'react-native';

import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { POC_FLOW_ROUTES, SCREEN_CATALOG } from '@/constants/screens';
import { useResetDemo } from '@/features/demo/hooks/useResetDemo';
import { useResetRegistrationDemo } from '@/features/demo/hooks/useResetRegistrationDemo';
import { confirmDestructive } from '@/lib/confirmDestructive';

const GROUP_LABELS = {
  auth: 'Auth',
  discovery: 'Discovery',
  registration: 'Registration',
  main: 'Event-time',
} as const;

/** Dev screen — jump to any A01–A18 route (auth required for post-login groups). */
export default function FlowMapScreen() {
  const resetDemo = useResetDemo();
  const resetRegistration = useResetRegistrationDemo();
  const groups = ['auth', 'discovery', 'registration', 'main'] as const;

  const handleReset = () => {
    Alert.alert('Reset demo?', copy.homeResetHint, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Reset', style: 'destructive', onPress: () => resetDemo.mutate() },
    ]);
  };

  const handleResetRegistration = () => {
    confirmDestructive(copy.devResetRegistrationTitle, copy.devResetRegistrationHint, () =>
      resetRegistration.mutate(),
    );
  };

  return (
    <AppScreen>
      <AppHeader title="Flow map" subtitle="A01–A18 — login required after A02" />
      <ScrollView className="flex-1" contentContainerClassName="gap-4 pb-8">
        {groups.map((group) => (
          <View key={group}>
            <Text className="mb-2 text-sm font-bold uppercase tracking-wide text-primary">
              {GROUP_LABELS[group]}
            </Text>
            <View className="gap-2">
              {SCREEN_CATALOG.filter((screen) => screen.group === group).map((screen) => (
                <Link key={screen.id} href={POC_FLOW_ROUTES[screen.id] as Href} asChild>
                  <GlassSurface className="p-4 active:opacity-90">
                    <Text className="text-xs font-bold text-primary">{screen.id}</Text>
                    <Text className="mt-1 font-semibold text-foreground">{screen.title}</Text>
                  </GlassSurface>
                </Link>
              ))}
            </View>
          </View>
        ))}
        <Link href="/(auth)/login" asChild>
          <GradientButton className="mt-2 w-full">{copy.homeStartDemo}</GradientButton>
        </Link>
        <GradientButton className="w-full" disabled={resetRegistration.isPending} onPress={handleResetRegistration}>
          {resetRegistration.isPending ? copy.homeResetting : copy.devResetRegistration}
        </GradientButton>
        <GradientButton className="w-full" disabled={resetDemo.isPending} onPress={handleReset}>
          {resetDemo.isPending ? copy.homeResetting : copy.homeResetDemo}
        </GradientButton>
      </ScrollView>
    </AppScreen>
  );
}
