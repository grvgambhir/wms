import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';

import { resetDemoState } from '@/data/storage/resetDemo';

/** Clears AsyncStorage + React Query cache, then returns to login for a fresh demo. */
export function useResetDemo() {
  const queryClient = useQueryClient();
  const router = useRouter();

  return useMutation({
    mutationFn: async () => {
      await resetDemoState();
      queryClient.clear();
    },
    onSuccess: () => {
      router.replace('/(auth)/login');
    },
  });
}
