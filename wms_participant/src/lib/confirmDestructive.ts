import { Alert, Platform } from 'react-native';

/** Web Alert.alert is OK-only; use window.confirm so tester reset can be cancelled. */
export function confirmDestructive(title: string, message: string, onConfirm: () => void): void {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    if (window.confirm(`${title}\n\n${message}`)) {
      onConfirm();
    }
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Reset', style: 'destructive', onPress: onConfirm },
  ]);
}
