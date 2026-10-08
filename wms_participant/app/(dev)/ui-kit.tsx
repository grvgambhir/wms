import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { EventCard } from '@/components/event/EventCard';
import { SportCard } from '@/components/event/SportCard';
import { RegistrationStatusBadge } from '@/components/registration/RegistrationStatusBadge';
import { RegistrationStepper } from '@/components/registration/RegistrationStepper';
import { AppHeader } from '@/components/shell/AppHeader';
import { AppScreen } from '@/components/shell/AppScreen';
import { BottomActionBar } from '@/components/shell/BottomActionBar';
import { EmptyState } from '@/components/shell/EmptyState';
import { ErrorState } from '@/components/shell/ErrorState';
import { LoadingState } from '@/components/shell/LoadingState';
import { OtpInput } from '@/components/shell/OtpInput';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { GlassSurface } from '@/components/ui/glass-surface';
import { GradientButton } from '@/components/ui/gradient-button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { colors } from '@/theme/colors';
import { gradients } from '@/theme/gradients';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="gap-3">
      <Text className="text-lg font-bold text-foreground">{title}</Text>
      {children}
    </View>
  );
}

function GradientSwatch({ name, colors: gradientColors }: { name: string; colors: readonly [string, string, ...string[]] }) {
  return (
    <View className="flex-1 gap-2 overflow-hidden rounded-xl">
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ height: 48, borderRadius: 12 }}
      />
      <Text className="text-xs text-muted-foreground">{name}</Text>
    </View>
  );
}

/** Dev showcase — World Masters Sport design tokens and components. */
export default function UiKitScreen() {
  const [otp, setOtp] = useState('');

  return (
    <AppScreen className="pb-0">
      <ScrollView className="flex-1" contentContainerClassName="gap-8 pb-8 pt-2" showsVerticalScrollIndicator={false}>
        <AppHeader title="UI Kit" subtitle="Phase 1.5 — premium aesthetic" />

        <Section title="Gradients">
          <View className="flex-row gap-3">
            <GradientSwatch name="Hero" colors={gradients.hero} />
            <GradientSwatch name="CTA" colors={gradients.cta} />
            <GradientSwatch name="Screen" colors={gradients.screen} />
          </View>
        </Section>

        <Section title="Glass surface">
          <GlassSurface className="p-4">
            <Text className="font-semibold text-foreground">Frosted glass card</Text>
            <Text className="mt-1 text-sm text-muted-foreground">
              Semi-transparent surface with soft border and depth shadow.
            </Text>
          </GlassSurface>
        </Section>

        <Section title="Typography">
          <Text className="text-3xl font-bold text-foreground">Display heading</Text>
          <Text className="text-base leading-6 text-foreground">Body text for athlete-facing content.</Text>
          <Text className="text-sm text-muted-foreground">Muted helper copy for secondary information.</Text>
        </Section>

        <Section title="Buttons">
          <View className="gap-3">
            <GradientButton>Primary gradient CTA</GradientButton>
            <Button variant="outline" size="lg">
              <Text>Outline action</Text>
            </Button>
            <Button variant="ghost">
              <Text>Text action</Text>
            </Button>
          </View>
        </Section>

        <Section title="Inputs">
          <GlassSurface className="gap-4 p-4">
            <View className="gap-2">
              <Label nativeID="email">Email</Label>
              <Input nativeID="email" placeholder="daniel.harper@example.com" />
            </View>
            <View className="gap-2">
              <Label>OTP</Label>
              <OtpInput value={otp} onChange={setOtp} />
              <Text className="text-sm text-muted-foreground">Demo OTP: 123456</Text>
            </View>
          </GlassSurface>
        </Section>

        <Section title="Badges & status">
          <View className="flex-row flex-wrap gap-2">
            <Badge>
              <Text>Default</Text>
            </Badge>
            <Badge variant="secondary">
              <Text>Secondary</Text>
            </Badge>
            <RegistrationStatusBadge status="under_review" />
            <RegistrationStatusBadge status="approved" />
          </View>
        </Section>

        <Separator />

        <Section title="Event & sport cards">
          <EventCard
            name="Open Masters Games 2027"
            city="Como"
            country="Italy"
            dateRange="12–21 Sep 2027"
            status="registration_open"
            onPress={() => undefined}
          />
          <SportCard name="Tennis" subtitle="Singles & doubles" availability="available" iconLabel="T" onPress={() => undefined} />
        </Section>

        <Section title="Registration stepper">
          <RegistrationStepper currentStep={3} />
          <RegistrationStepper currentStep={3} orientation="vertical" />
        </Section>

        <Section title="Feedback states">
          <LoadingState message="Loading events…" />
          <EmptyState title="No sports found" description="Try a different search term." tone="search" />
          <EmptyState title="No registered events yet" description="Register to see them here." tone="inbox" />
          <ErrorState onRetry={() => undefined} />
        </Section>

        <Section title="Brand colors">
          <View className="flex-row gap-3">
            <View className="flex-1 items-center gap-2">
              <View className="h-12 w-full rounded-xl" style={{ backgroundColor: colors.primary }} />
              <Text className="text-xs text-muted-foreground">Primary</Text>
            </View>
            <View className="flex-1 items-center gap-2">
              <View className="h-12 w-full rounded-xl" style={{ backgroundColor: colors.success }} />
              <Text className="text-xs text-muted-foreground">Success</Text>
            </View>
          </View>
        </Section>
      </ScrollView>

      <BottomActionBar>
        <GradientButton className="w-full">Bottom gradient CTA</GradientButton>
      </BottomActionBar>
    </AppScreen>
  );
}
