import { View } from 'react-native';

import { RegistrationStepper } from '@/components/registration/RegistrationStepper';
import { AppChrome } from '@/components/shell/AppChrome';
import { PAGE_CONTAINER, SCREEN_GUTTER_COMPACT, SCREEN_GUTTER_WIDE } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type RegistrationFormLayoutProps = {
  children: React.ReactNode;
  /** Optional title row rendered full-width above the stepper/content split. */
  header?: React.ReactNode;
  /** When set, compact shows a bar stepper; wide web shows a left step rail. */
  currentStep?: number;
  /** @deprecated All wizard screens use the website container (max-w-7xl). */
  wide?: boolean;
  /** Set false when parent already applies gutters (e.g. AppChrome). */
  withGutters?: boolean;
  /** Wide web: wrap with site header. Off when the screen already has AppChrome (A16). */
  siteNav?: boolean;
  className?: string;
};

/**
 * Registration wizard shell.
 * Compact: stacked header + bar stepper + form.
 * Wide web: site header + max-w-7xl + optional vertical step rail.
 */
export function RegistrationFormLayout({
  children,
  header,
  currentStep,
  withGutters = true,
  siteNav = true,
  className,
}: RegistrationFormLayoutProps) {
  const { isWideWeb } = useAppLayout();
  const showRail = isWideWeb && currentStep != null;
  const nestedInChrome = siteNav && isWideWeb;
  const gutters = withGutters && !nestedInChrome;

  const body = (
    <View
      className={cn(
        'min-h-0 w-full flex-1',
        gutters && (isWideWeb ? SCREEN_GUTTER_WIDE : SCREEN_GUTTER_COMPACT),
        isWideWeb && PAGE_CONTAINER,
        className,
      )}>
      {header ? <View className="shrink-0">{header}</View> : null}
      <View className={cn('min-h-0 flex-1', showRail ? 'flex-row gap-8 pt-2' : 'flex-col')}>
        {showRail ? (
          <View className="w-64 shrink-0 self-start py-1">
            <RegistrationStepper currentStep={currentStep} orientation="vertical" />
          </View>
        ) : null}
        <View className="min-h-0 flex-1 flex-col">
          {!isWideWeb && currentStep != null ? (
            <View className="mb-3 shrink-0">
              <RegistrationStepper currentStep={currentStep} />
            </View>
          ) : null}
          {children}
        </View>
      </View>
    </View>
  );

  if (nestedInChrome) {
    return <AppChrome active="registrations">{body}</AppChrome>;
  }

  return body;
}
