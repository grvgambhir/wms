import { Bell, Menu } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { useAppNavMenu } from '@/components/shell/AppNavMenu';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { useAppLayout } from '@/hooks/useAppLayout';

/** Compact GamesHub top bar — hamburger only when bottom-nav chrome is active. */
export function GamesHubToolbar() {
  const { useWebHeader } = useAppLayout();
  const { openMenu } = useAppNavMenu();

  if (useWebHeader) return null;

  return (
    <View className="flex-row items-center justify-between">
      <Pressable
        onPress={openMenu}
        className="h-10 w-10 items-center justify-center rounded-full bg-white/80 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel="Open menu">
        <Menu size={20} color="#0F172A" />
      </Pressable>
      <Text className="text-base font-bold text-foreground">GamesHub</Text>
      <Pressable
        onPress={() => Alert.alert(copy.navEvents, copy.notificationsStub)}
        className="h-10 w-10 items-center justify-center rounded-full bg-white/80 active:opacity-80"
        accessibilityRole="button"
        accessibilityLabel="Notifications">
        <Bell size={20} color="#0F172A" />
      </Pressable>
    </View>
  );
}