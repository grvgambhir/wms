import { ScrollView, View } from 'react-native';

import { AuthHeroBanner } from '@/components/auth/AuthHeroBanner';
import { LanguageToggle } from '@/components/shell/LanguageToggle';
import { SCREEN_GUTTER_COMPACT } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type AuthFormLayoutProps = {
  children: React.ReactNode;
  /**
   * true — stacked hero on compact, full-bleed left pane on wide.
   * 'wide' — hero only on laptop (OTP keeps a compact phone form).
   */
  hero?: boolean | 'wide';
  className?: string;
};

/**
 * Auth shell — compact stays a phone form; wide web is a full-viewport split
 * (hero | form) instead of a centered max-w-5xl card.
 */
export function AuthFormLayout({ children, hero = false, className }: AuthFormLayoutProps) {
  const { isWideWeb } = useAppLayout();
  const showHero = hero === true || (hero === 'wide' && isWideWeb);
  const formContent = (
    <>
      <View className="mb-5 items-end">
        <LanguageToggle />
      </View>
      {children}
    </>
  );

  if (isWideWeb) {
    return (
      <View className={cn('min-h-0 w-full flex-1 flex-row', className)}>
        {showHero ? (
          <View className="min-h-0 flex-[1.2]">
            <AuthHeroBanner className="h-full min-h-0" />
          </View>
        ) : null}
        <ScrollView
          className="min-h-0 flex-1 bg-background"
          contentContainerClassName="min-h-full flex-grow justify-center px-10 py-10 lg:px-16 xl:px-24"
          keyboardShouldPersistTaps="handled">
          <View className="mx-auto w-full max-w-md">{formContent}</View>
        </ScrollView>
      </View>
    );
  }

  if (showHero) {
    return (
      <ScrollView
        className={cn('flex-1', className)}
        contentContainerClassName="flex-grow"
        keyboardShouldPersistTaps="handled">
        <AuthHeroBanner />
        <View className="-mt-6 flex-1 rounded-t-[28px] bg-background px-5 pb-8 pt-6 shadow-lg shadow-black/10">
          {formContent}
        </View>
      </ScrollView>
    );
  }

  return <View className={cn('min-h-0 w-full flex-1', SCREEN_GUTTER_COMPACT, className)}>{formContent}</View>;
}
