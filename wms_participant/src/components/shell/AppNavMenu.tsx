import { Link } from 'expo-router';
import { CalendarDays, Home, LogOut, Ticket, User, X } from 'lucide-react-native';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WmsMark } from '@/components/brand/WmsMark';
import { Text } from '@/components/ui/text';
import { useToast } from '@/components/ui/toast';
import { copy } from '@/constants/copy';
import { APP_NAV_TABS, type AppNavTab } from '@/constants/navigation';
import { useSignOut } from '@/features/auth/hooks/useAuth';
import { cn } from '@/lib/utils';
import { colors } from '@/theme/colors';

const TAB_ICONS = {
  home: Home,
  events: CalendarDays,
  registrations: Ticket,
  profile: User,
} as const;

type AppNavMenuContextValue = {
  openMenu: () => void;
  closeMenu: () => void;
};

const AppNavMenuContext = createContext<AppNavMenuContextValue | null>(null);

type AppNavMenuProviderProps = {
  active: AppNavTab;
  children: React.ReactNode;
};

/** Compact-mode slide-over menu — opened from Events hamburger. */
export function AppNavMenuProvider({ active, children }: AppNavMenuProviderProps) {
  const [visible, setVisible] = useState(false);
  const insets = useSafeAreaInsets();
  const signOut = useSignOut();
  const { showToast } = useToast();

  const openMenu = useCallback(() => setVisible(true), []);
  const closeMenu = useCallback(() => setVisible(false), []);

  const value = useMemo(() => ({ openMenu, closeMenu }), [openMenu, closeMenu]);

  const handleLogout = async () => {
    closeMenu();
    await signOut.mutateAsync();
    showToast({
      title: copy.toastSignedOut,
      description: copy.toastSignedOutBody,
      variant: 'info',
    });
  };

  return (
    <AppNavMenuContext.Provider value={value}>
      {children}

      <Modal visible={visible} transparent animationType="fade" onRequestClose={closeMenu}>
        <View className="flex-1 flex-row">
          <Pressable className="flex-1 bg-black/40" onPress={closeMenu} accessibilityRole="button" accessibilityLabel="Close menu" />

          <View
            className="w-[min(320px,85%)] border-l border-border bg-white shadow-2xl"
            style={{ paddingTop: Math.max(insets.top, 16), paddingBottom: Math.max(insets.bottom, 16) }}>
            <View className="flex-row items-center justify-between px-5 pb-4">
              <WmsMark size="sm" />
              <Pressable
                onPress={closeMenu}
                className="h-10 w-10 items-center justify-center rounded-full bg-muted/40 active:opacity-80"
                accessibilityRole="button"
                accessibilityLabel="Close menu">
                <X size={20} color="#0F172A" />
              </Pressable>
            </View>

            <Text className="px-5 pb-3 text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {copy.navMenuTitle}
            </Text>

            <View className="gap-1 px-3">
              {APP_NAV_TABS.map((tab) => {
                const Icon = TAB_ICONS[tab.id];
                const isActive = tab.id === active;
                return (
                  <Link key={tab.id} href={tab.href} asChild>
                    <Pressable
                      onPress={closeMenu}
                      className={cn(
                        'flex-row items-center gap-3 rounded-xl px-3 py-3 active:opacity-80',
                        isActive ? 'bg-primary/10' : 'bg-transparent',
                      )}>
                      <Icon size={20} color={isActive ? colors.primary : colors.textMuted} />
                      <Text className={cn('text-base font-semibold', isActive ? 'text-primary' : 'text-foreground')}>
                        {tab.label}
                      </Text>
                    </Pressable>
                  </Link>
                );
              })}
            </View>

            <View className="mt-auto border-t border-border px-5 pt-4">
              <Pressable
                onPress={handleLogout}
                disabled={signOut.isPending}
                className="flex-row items-center gap-3 rounded-xl px-3 py-3 active:opacity-80">
                <LogOut size={20} color="#DC2626" />
                <Text className="text-base font-semibold text-destructive">
                  {signOut.isPending ? copy.accountLoggingOut : copy.accountLogout}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </AppNavMenuContext.Provider>
  );
}

/** Open the compact-mode nav drawer (no-op when provider is absent). */
export function useAppNavMenu() {
  const context = useContext(AppNavMenuContext);
  return {
    openMenu: context?.openMenu ?? (() => undefined),
    closeMenu: context?.closeMenu ?? (() => undefined),
    hasMenu: Boolean(context),
  };
}
