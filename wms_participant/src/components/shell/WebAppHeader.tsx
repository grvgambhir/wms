import { Link } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WmsMark } from '@/components/brand/WmsMark';
import { Text } from '@/components/ui/text';
import { APP_NAV_TABS, type AppNavTab } from '@/constants/navigation';
import { SCREEN_GUTTER_WIDE } from '@/constants/layout';
import { cn } from '@/lib/utils';

type WebAppHeaderProps = {
  active: AppNavTab;
};

/** Wide-web top navigation — spans full viewport width (no side gutters). */
export function WebAppHeader({ active }: WebAppHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="w-full border-b border-border bg-white"
      style={{ paddingTop: Math.max(insets.top, 12) }}>
      <View className={cn('w-full flex-row items-center justify-between gap-4 pb-3', SCREEN_GUTTER_WIDE)}>
        <Link href="/(discovery)/events" asChild>
          <Pressable className="active:opacity-80">
            <WmsMark size="sm" />
          </Pressable>
        </Link>

        <View className="flex-row flex-wrap items-center justify-end gap-1">
          {APP_NAV_TABS.map((tab) => {
            const isActive = tab.id === active;
            return (
              <Link key={tab.id} href={tab.href} asChild>
                <Pressable
                  className={cn(
                    'rounded-lg px-4 py-2 active:opacity-80',
                    isActive ? 'bg-primary/10' : 'bg-transparent hover:bg-primary/5',
                  )}>
                  <Text className={cn('text-sm font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
                    {tab.label}
                  </Text>
                </Pressable>
              </Link>
            );
          })}
        </View>
      </View>
    </View>
  );
}
