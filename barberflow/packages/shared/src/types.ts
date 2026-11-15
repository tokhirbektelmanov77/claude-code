/** Response shapes returned by the API (JSON: dates are ISO strings). */

export type AppointmentStatus = 'CONFIRMED' | 'COMPLETED' | 'CANCELLED' | 'NO_SHOW';
export type MemberRole = 'OWNER' | 'MANAGER' | 'BARBER';

export interface PublicService {
  id: string;
  name: string;
  nameUz: string | null;
  description: string | null;
  priceUzs: number;
  durationMin: number;
}

export interface PublicBarber {
  id: string;
  slug: string;
  name: string;
  specialization: string | null;
  bio: string | null;
  photoUrl: string | null;
  serviceIds: string[];
  /** Effective price/duration per service for this barber (overrides applied). */
  prices: Record<string, { priceUzs: number; durationMin: number }>;
}

export interface PublicBusiness {
  id: string;
  slug: string;
  name: string;
  city: string | null;
  address: string | null;
  phone: string | null;
  description: string | null;
  coverUrl: string | null;
  latitude: number | null;
  longitude: number | null;
  timezone: string;
  cancellationPolicy: string | null;
  cancellationMinHours: number;
  bookingHorizonDays: number;
  acceptingBookings: boolean;
  barbers: PublicBarber[];
  services: PublicService[];
}

export interface SlotDto {
  start: string;
  end: string;
}

export interface AppointmentDto {
  id: string;
  businessId: string;
  barberId: string;
  serviceId: string;
  customerId: string;
  startsAt: string;
  endsAt: string;
  blockedUntil: string;
  status: AppointmentStatus;
  source: 'ONLINE' | 'MANUAL';
  priceUzs: number;
  durationMin: number;
  serviceName: string;
  customerNote: string | null;
  cancelReason: string | null;
  barber?: { id: string; name: string; slug: string; photoUrl: string | null };
  customer?: { id: string; name: string; phone: string | null };
  business?: { id: string; name: string; slug: string; address: string | null; city: string | null; latitude: number | null; longitude: number | null; timezone: string; cancellationMinHours: number };
}

export interface MeDto {
  id: string;
  phone: string | null;
  name: string | null;
  locale: 'ru' | 'uz';
  isPlatformAdmin: boolean;
  mustChangePassword: boolean;
  memberships: { businessId: string; businessName: string; businessSlug: string; role: MemberRole; onboardingStep: number; barberId: string | null }[];
}

/** Returned once after a guest booking: the manage token is never retrievable again. */
export interface GuestBookingResult extends AppointmentDto {
  manageToken: string;
  replayed?: boolean;
}

export interface ApiErrorBody {
  statusCode: number;
  code: string;
  message: string;
  details?: unknown;
}

/** Stable error codes the UI translates. */
export const ErrorCodes = {
  SLOT_TAKEN: 'SLOT_TAKEN',
  SLOT_UNAVAILABLE: 'SLOT_UNAVAILABLE',
  NOT_FOUND: 'NOT_FOUND',
  FORBIDDEN: 'FORBIDDEN',
  UNAUTHORIZED: 'UNAUTHORIZED',
  VALIDATION: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  PHONE_TAKEN: 'PHONE_TAKEN',
  TOO_MANY_BOOKINGS: 'TOO_MANY_BOOKINGS',
  BUSINESS_BLOCKED: 'BUSINESS_BLOCKED',
  BOOKING_DISABLED: 'BOOKING_DISABLED',
  CANCEL_TOO_LATE: 'CANCEL_TOO_LATE',
  INVALID_STATE: 'INVALID_STATE',
  SLUG_TAKEN: 'SLUG_TAKEN',
  PLAN_LIMIT: 'PLAN_LIMIT',
} as const;
