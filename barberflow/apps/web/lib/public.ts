'use client';
import { useQuery } from '@tanstack/react-query';
import type { Locale, PublicBusiness, PublicService } from '@barberflow/shared';
import { api } from './api';

export function usePublicBusiness(slug: string) {
  return useQuery({ queryKey: ['public-business', slug], queryFn: () => api<PublicBusiness>(`/public/businesses/${encodeURIComponent(slug)}`) });
}

export function serviceName(s: Pick<PublicService, 'name' | 'nameUz'>, locale: Locale) {
  return locale === 'uz' && s.nameUz ? s.nameUz : s.name;
}
