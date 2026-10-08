import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Legacy registration Profile step (REV-018).
 * Identity is edited on the Profile tab; old deep links continue into category.
 */
export default function PersonalProfileScreen() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  if (eventId) {
    return <Redirect href={{ pathname: '/(registration)/category', params: { eventId } }} />;
  }
  return <Redirect href="/(discovery)/account" />;
}
