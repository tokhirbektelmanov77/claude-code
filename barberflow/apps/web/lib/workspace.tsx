'use client';
import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import type { MemberRole, MeDto } from '@barberflow/shared';
import { api } from './api';
import { useMe } from './auth';

export interface BusinessDetail {
  id: string; slug: string; name: string; city: string | null; address: string | null; phone: string | null; description: string | null;
  coverUrl: string | null; latitude: number | null; longitude: number | null; timezone: string; status: 'ACTIVE' | 'BLOCKED'; blockedReason: string | null;
  bookingHorizonDays: number; minLeadMinutes: number; slotStepMinutes: number; cancellationMinHours: number; cancellationPolicy: string | null;
  onboardingStep: number; isDemo: boolean; acceptingBookings: boolean; myRole: MemberRole; myBarberId: string | null;
  subscription: { status: string; trialEndsAt: string | null; currentPeriodEnd: string | null; plan: { code: string; name: string } } | null;
}

interface WorkspaceValue {
  me: MeDto;
  businessId: string;
  business: BusinessDetail | undefined;
  role: MemberRole;
  barberId: string | null;
  isManager: boolean;
  timezone: string;
  switchBusiness: (id: string) => void;
  refetchBusiness: () => void;
}

const Ctx = React.createContext<WorkspaceValue | null>(null);
const KEY = 'bf_business';

function readStored(): string | null {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function WorkspaceProvider({ me, children }: { me: MeDto; children: React.ReactNode }) {
  const [selected, setSelected] = React.useState<string | null>(null);
  React.useEffect(() => setSelected(readStored()), []);
  const membership = me.memberships.find((m) => m.businessId === selected) ?? me.memberships[0];
  const businessId = membership.businessId;
  const q = useQuery({ queryKey: ['business', businessId], queryFn: () => api<BusinessDetail>(`/businesses/${businessId}`) });
  const switchBusiness = React.useCallback((id: string) => {
    try { localStorage.setItem(KEY, id); } catch { /* per-device convenience only */ }
    setSelected(id);
  }, []);
  const value: WorkspaceValue = {
    me,
    businessId,
    business: q.data,
    role: membership.role,
    barberId: membership.barberId,
    isManager: membership.role === 'OWNER' || membership.role === 'MANAGER',
    timezone: q.data?.timezone ?? 'Asia/Tashkent',
    switchBusiness,
    refetchBusiness: () => q.refetch(),
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspace() {
  const v = React.useContext(Ctx);
  if (!v) throw new Error('useWorkspace outside provider');
  return v;
}

export function useRequireMe() {
  return useMe();
}

/** Shared workspace queries. */
export interface BarberRow { id: string; name: string; slug: string; specialization: string | null; bio: string | null; photoUrl: string | null; isActive: boolean; branchId: string | null; userId: string | null; serviceIds: string[]; user: { id: string; phone: string | null; name: string | null } | null }
export interface ServiceRow { id: string; name: string; nameUz: string | null; description: string | null; priceUzs: number; durationMin: number; bufferAfterMin: number; isActive: boolean; barberIds: string[] }

export function useBarbers() {
  const { businessId } = useWorkspace();
  return useQuery({ queryKey: ['barbers', businessId], queryFn: () => api<BarberRow[]>(`/businesses/${businessId}/barbers`) });
}
export function useServices() {
  const { businessId } = useWorkspace();
  return useQuery({ queryKey: ['services', businessId], queryFn: () => api<ServiceRow[]>(`/businesses/${businessId}/services`) });
}
