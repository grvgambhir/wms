import { Redirect } from 'expo-router';

import { isDemoSession, landingHref } from '@/auth/session';
import { AppScreen } from '@/components/shell/AppScreen';
import { LoadingState } from '@/components/shell/LoadingState';
import { useAuthSession, useMeProfile } from '@/features/auth/hooks/useAuth';

/** App entry — login, demo dashboard, complete-profile, or the registration journey. */
export default function IndexScreen() {
  const { data: session, isLoading } = useAuthSession();
  const demo = !!session && isDemoSession(session);
  const me = useMeProfile(!!session && !demo);

  if (isLoading || (session && !demo && me.isLoading)) {
    return (
      <AppScreen plain>
        <LoadingState />
      </AppScreen>
    );
  }

  return <Redirect href={landingHref(session ?? null, me.data ?? null)} />;
}
