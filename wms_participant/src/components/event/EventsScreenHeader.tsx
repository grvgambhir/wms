import { Bell, Menu } from 'lucide-react-native';
import { Alert, Pressable, View } from 'react-native';

import { useAppNavMenu } from '@/components/shell/AppNavMenu';
import { Text } from '@/components/ui/text';
import { copy } from '@/constants/copy';
import { PAGE_LEAD, PAGE_TITLE } from '@/constants/layout';
import { useAppLayout } from '@/hooks/useAppLayout';
import { cn } from '@/lib/utils';

type EventsScreenHeaderProps = {
  onMenuPress?: () => void;
  onNotificationsPress?: () => void;
};

/** A03 page title — hamburger only on compact web/native (top nav handles wide web). */
export function EventsScreenHeader({ onMenuPress, onNotificationsPress }: EventsScreenHeaderProps) {
  const { useWebHeader } = useAppLayout();
  const { openMenu } = useAppNavMenu();

  const handleMenuPress = () => {
    if (onMenuPress) {
      onMenuPress();
      return;
    }
    openMenu();
  };

  const handleNotificationsPress = () => {
    if (onNotificationsPress) {
      onNotificationsPress();
      return;
    }
    Alert.alert(copy.navEvents, copy.notificationsStub);
  };

  return (
    <View className="mb-4 gap-3">
      {!useWebHeader ? (
        <View className="flex-row items-center justify-between">
          <Pressable
            onPress={handleMenuPress}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/80 hover:bg-white active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Open menu">
            <Menu size={20} color="#0F172A" />
          </Pressable>
          <Pressable
            onPress={handleNotificationsPress}
            className="h-10 w-10 items-center justify-center rounded-full bg-white/80 hover:bg-white active:opacity-80"
            accessibilityRole="button"
            accessibilityLabel="Notifications">
            <Bell size={20} color="#0F172A" />
          </Pressable>
        </View>
      ) : null}

      <View>
        <Text className={PAGE_TITLE}>{copy.eventsTitle}</Text>
        <Text className={cn('mt-1', PAGE_LEAD)}>{copy.eventsSubtitle}</Text>
      </View>
    </View>
  );
}
