'use client';

import { useMemo } from 'react';
import { useAuth } from './auth';
import { createApiClient } from './api';

export function useApi() {
  const { token } = useAuth();
  return useMemo(() => createApiClient(token), [token]);
}
