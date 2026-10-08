import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';

import { EmptyState } from '@/components/shell/EmptyState';
import { Text } from '@/components/ui/text';
import { useCopy } from '@/i18n';
import { colors } from '@/theme/colors';

/**
 * Shown by a journey screen when the signed-in person has no entry to work on. Not an error:
 * every athlete is in this state before they register.
 */
export function NoEntryState() {
  const router = useRouter();
  const copy = useCopy();
  return (
    <EmptyState
      tone="folder"
      title={copy.noEntryTitle}
      description={copy.noEntryBody}
      action={
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/register')}
          style={{
            backgroundColor: colors.primary,
            borderRadius: 10,
            paddingVertical: 12,
            paddingHorizontal: 16,
            alignItems: 'center',
          }}
        >
          <Text style={{ color: colors.primaryForeground, fontWeight: '800' }}>{copy.myEntriesRegisterCta}</Text>
        </Pressable>
      }
    />
  );
}
