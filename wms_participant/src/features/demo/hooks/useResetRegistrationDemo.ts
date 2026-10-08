import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useRef } from 'react';

import { copy } from '@/constants/copy';
import { resetRegistrationDemoKeepSession } from '@/data/storage/resetRegistrationDemo';
import { confirmDestructive } from '@/lib/confirmDestructive';
import { useToast } from '@/components/ui/toast';

/** Clears event registration persistence while keeping the auth session. */
export function useResetRegistrationDemo() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const { showToast } = useToast();

  return useMutation({
    mutationFn: async () => {
      await resetRegistrationDemoKeepSession();
      await queryClient.invalidateQueries({ queryKey: ['registration'] });
      await queryClient.invalidateQueries({ queryKey: ['documents'] });
      await queryClient.invalidateQueries({ queryKey: ['partners'] });
      await queryClient.invalidateQueries({ queryKey: ['accreditation'] });
    },
    onSuccess: () => {
      showToast({
        title: copy.toastRegistrationReset,
        description: copy.toastRegistrationResetBody,
        variant: 'info',
      });
      router.replace('/(discovery)/events');
    },
  });
}

/** Five quick taps opens the tester registration reset confirm. */
export function useHiddenRegistrationResetGesture() {
  const resetRegistration = useResetRegistrationDemo();
  const tapCount = useRef(0);
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  return () => {
    tapCount.current += 1;
    if (tapTimer.current) clearTimeout(tapTimer.current);
    tapTimer.current = setTimeout(() => {
      tapCount.current = 0;
    }, 2000);

    if (tapCount.current < 5) return;
    tapCount.current = 0;
    confirmDestructive(copy.devResetRegistrationTitle, copy.devResetRegistrationHint, () =>
      resetRegistration.mutate(),
    );
  };
}

