import { Link } from 'expo-router';
import { CalendarDays, Home, Ticket, User } from 'lucide-react-native';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Text } from '@/components/ui/text';
import { APP_NAV_TABS, type AppNavTab } from '@/constants/navigation';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

const TAB_ICONS = {
  home: Home,
  events: CalendarDays,
  registrations: Ticket,
  profile: User,
} as const;

type AppBottomNavProps = {
  active: AppNavTab;
};

/** Compact tab bar — shrink-0 footer so it stays on-screen while content scrolls. */
export function AppBottomNav({ active }: AppBottomNavProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="shrink-0 border-t border-border bg-white px-2 pt-2"
      style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
      <View className="flex-row items-center justify-between">
        {APP_NAV_TABS.map((tab) => {
          const Icon = TAB_ICONS[tab.id];
          const isActive = tab.id === active;
          return (
            <Link key={tab.id} href={tab.href} asChild>
              <Pressable className="min-w-[72px] items-center gap-1 py-1 active:opacity-80">
                <Icon size={20} color={isActive ? colors.primary : colors.textMuted} />
                <Text className={cn('text-[10px] font-semibold', isActive ? 'text-primary' : 'text-muted-foreground')}>
                  {tab.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>
    </View>
  );
}
