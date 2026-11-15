import type { AppointmentDto } from '@barberflow/shared';

export interface CalendarBarber { id: string; name: string; photoUrl: string | null; slug: string; workingHours: { weekday: number; startMin: number; endMin: number }[] }
export interface CalendarException { id: string; barberId: string; type: 'DAY_OFF' | 'VACATION' | 'BLOCK'; startsAt: string; endsAt: string; note: string | null }
export interface CalendarFeed { barbers: CalendarBarber[]; appointments: AppointmentDto[]; exceptions: CalendarException[] }
export interface AppointmentEvent { id: string; type: string; createdAt: string; data: Record<string, unknown> | null }
export interface AppointmentDetail extends AppointmentDto { events: AppointmentEvent[]; customerVisits: number }
