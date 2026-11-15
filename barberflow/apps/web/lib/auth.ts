'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { MeDto } from '@barberflow/shared';
import { api, ApiError } from './api';

export function useMe() {
  return useQuery<MeDto | null>({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await api<MeDto>('/auth/me');
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    staleTime: 60_000,
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return async () => {
    await api('/auth/logout', { method: 'POST', body: {} }).catch(() => undefined);
    qc.clear();
    // Full reload on purpose: drops every cached query of the signed-out user.
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination
    window.location.href = '/';
  };
}
