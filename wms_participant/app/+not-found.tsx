import { Link, Stack } from 'expo-router';
import { Text, View } from 'react-native';

import { AppScreen } from '@/components/shell/AppScreen';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Not found' }} />
      <AppScreen className="justify-center">
        <Text className="text-xl font-bold text-foreground">This screen does not exist.</Text>
        <Link href="/" className="mt-4">
          <Text className="text-base font-medium text-primary">Go to home</Text>
        </Link>
      </AppScreen>
    </>
  );
}
