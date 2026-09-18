'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './auth';
import { createApiClient } from './api';

export function useApi() {
  const { token, logout } = useAuth();
  const router = useRouter();

  return useMemo(
    () =>
      createApiClient(token, () => {
        // A 401 on an authenticated request means the token expired or was
        // invalidated server-side — clear the stale session immediately
        // instead of leaving the user stuck on a page silently failing
        // every request until they notice and sign out manually.
        logout();
        router.replace('/login');
      }),
    [token], // eslint-disable-line react-hooks/exhaustive-deps
  );
}
