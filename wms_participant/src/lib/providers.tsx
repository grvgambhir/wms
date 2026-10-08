import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, type ReactNode } from 'react';

import { setAccessTokenProvider } from '@/auth/accessToken';
import { createAmplifyCognitoClient } from '@/auth/amplifyClient';
import { setCognitoAuthClient } from '@/auth/cognitoClient';
import { cognitoConfig } from '@/auth/env';
import { ToastProvider } from '@/components/ui/toast';
import { LocaleProvider } from '@/i18n';

function bootCognito(): void {
  if (process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID) return;
  if (!cognitoConfig()) return;
  const client = createAmplifyCognitoClient();
  client.configure();
  setCognitoAuthClient(client);
  setAccessTokenProvider({
    getAccessToken: () => client.fetchAccessToken(false),
    refreshAccessToken: () => client.fetchAccessToken(true),
  });
}

bootCognito();

type AppProvidersProps = {
  children: ReactNode;
};

/** Root providers for data fetching and future app-wide context. */
export function AppProviders({ children }: AppProvidersProps) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            retry: 1,
            staleTime: 30_000,
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <LocaleProvider>
        <ToastProvider>{children}</ToastProvider>
      </LocaleProvider>
    </QueryClientProvider>
  );
}
