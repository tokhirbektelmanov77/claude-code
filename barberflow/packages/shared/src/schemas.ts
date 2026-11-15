import { z } from 'zod';
import { normalizeUzPhone } from './format';
import { SLUG_PATTERN, RESERVED_SLUGS } from './slug';

/**
 * Request contracts shared by the API (validation) and the web app (forms).
 * Keep messages as stable error codes; the UI maps them to localized text.
 */

export const uzPhone = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeUzPhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'INVALID_PHONE' });
      return z.NEVER;
    }
    return n;
  });

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'INVALID_DATE');
export const uuid = z.uuid();
export const slug = z
  .string()
  .trim()
  .toLowerCase()
  .regex(SLUG_PATTERN, 'INVALID_SLUG')
  .refine((s) => !RESERVED_SLUGS.has(s), 'RESERVED_SLUG');

const name = z.string().trim().min(1, 'REQUIRED').max(80);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));
const minuteOfDay = z.number().int().min(0).max(1440);

// ---------- Auth (staff only: barbers, owners, admins) ----------
export const passwordSchema = z.string().min(8, 'PASSWORD_TOO_SHORT').max(128);
export const registerSchema = z.object({ name: name, phone: uzPhone, password: passwordSchema });
export const loginSchema = z.object({ phone: uzPhone, password: z.string().min(1).max(128) });
export const changePasswordSchema = z.object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema });
export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  locale: z.enum(['ru', 'uz']).optional(),
});

// ---------- Business / onboarding ----------
export const createBusinessSchema = z.object({
  name: name,
  slug: slug.optional(),
});
export const updateBusinessSchema = z.object({
  name: name.optional(),
  city: optionalText(80),
  address: optionalText(200),
  phone: z.union([uzPhone, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  description: optionalText(500),
  coverUrl: z.union([z.url().max(500), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  bookingHorizonDays: z.number().int().min(1).max(180).optional(),
  minLeadMinutes: z.number().int().min(0).max(7 * 24 * 60).optional(),
  slotStepMinutes: z.union([z.literal(5), z.literal(10), z.literal(15), z.literal(20), z.literal(30), z.literal(60)]).optional(),
  cancellationMinHours: z.number().int().min(0).max(72).optional(),
  cancellationPolicy: optionalText(500),
  onboardingStep: z.number().int().min(1).max(7).optional(),
});

export const branchSchema = z.object({
  name: name,
  city: optionalText(80),
  address: optionalText(200),
  phone: z.union([uzPhone, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  isActive: z.boolean().optional(),
});

// ---------- Barbers ----------
export const barberSchema = z.object({
  name: name,
  slug: slug.optional(),
  specialization: optionalText(80),
  bio: optionalText(300),
  photoUrl: z.union([z.url().max(500), z.literal(''), z.null()]).optional().transform((v) => (v ? v : null)),
  branchId: uuid.nullable().optional(),
  isActive: z.boolean().optional(),
  serviceIds: z.array(uuid).max(100).optional(),
});
export const barberUpdateSchema = barberSchema.partial();

// ---------- Services ----------
export const serviceSchema = z.object({
  name: name,
  nameUz: optionalText(80),
  description: optionalText(300),
  priceUzs: z.number().int().min(0).max(100_000_000),
  durationMin: z.number().int().min(5).max(8 * 60),
  bufferAfterMin: z.number().int().min(0).max(120).default(0),
  isActive: z.boolean().optional(),
  barberIds: z.array(uuid).max(100).optional(),
});
export const serviceUpdateSchema = serviceSchema.partial();

// ---------- Schedule ----------
export const workingIntervalSchema = z
  .object({ weekday: z.number().int().min(1).max(7), startMin: minuteOfDay, endMin: minuteOfDay })
  .refine((w) => w.endMin > w.startMin, 'END_BEFORE_START');

export const workingHoursSchema = z
  .object({ intervals: z.array(workingIntervalSchema).max(50) })
  .refine((v) => {
    for (const a of v.intervals)
      for (const b of v.intervals)
        if (a !== b && a.weekday === b.weekday && a.startMin < b.endMin && b.startMin < a.endMin) return false;
    return true;
  }, 'OVERLAPPING_INTERVALS');

export const scheduleExceptionSchema = z
  .object({
    type: z.enum(['DAY_OFF', 'VACATION', 'BLOCK']),
    startsAt: z.iso.datetime({ offset: true }),
    endsAt: z.iso.datetime({ offset: true }),
    note: optionalText(200),
  })
  .refine((v) => new Date(v.endsAt) > new Date(v.startsAt), 'END_BEFORE_START');

// ---------- Booking ----------
export const availabilityQuerySchema = z.object({
  serviceId: uuid,
  date: isoDate,
});
export const availableDatesQuerySchema = z.object({ serviceId: uuid });

/** Guest booking: no account, no code — name and phone only. Client pays the barber on site. */
export const createBookingSchema = z.object({
  barberId: uuid,
  serviceId: uuid,
  startsAt: z.iso.datetime({ offset: true }),
  customerName: name,
  phone: uzPhone,
  note: optionalText(300),
  consent: z.literal(true, { message: 'CONSENT_REQUIRED' }),
});

export const manualBookingSchema = z.object({
  barberId: uuid,
  serviceId: uuid,
  startsAt: z.iso.datetime({ offset: true }),
  customerId: uuid.optional(),
  customer: z.object({ name: name, phone: z.union([uzPhone, z.literal('')]).optional() }).optional(),
  note: optionalText(300),
}).refine((v) => v.customerId || v.customer, 'CUSTOMER_REQUIRED');

export const rescheduleSchema = z.object({ startsAt: z.iso.datetime({ offset: true }) });
export const cancelSchema = z.object({ reason: optionalText(200) });
export const statusChangeSchema = z.object({ status: z.enum(['COMPLETED', 'NO_SHOW']) });

// ---------- Team ----------
export const inviteSchema = z.object({
  /** Optional note for the owner; acceptance is by secret link, not by phone. */
  phone: z.union([uzPhone, z.literal('')]).optional().transform((v) => (v ? v : null)),
  role: z.enum(['MANAGER', 'BARBER']),
  barberId: uuid.optional(),
});
export const memberUpdateSchema = z.object({
  role: z.enum(['OWNER', 'MANAGER', 'BARBER']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
});

export const customerSchema = z.object({
  name: name,
  phone: z.union([uzPhone, z.literal('')]).optional().transform((v) => (v ? v : null)),
  notes: optionalText(500),
});

// ---------- Platform admin ----------
export const planUpdateSchema = z.object({
  name: name.optional(),
  description: optionalText(300),
  priceUzs: z.number().int().min(0).max(100_000_000).optional(),
  minSeats: z.number().int().min(1).max(1000).optional(),
  maxSeats: z.number().int().min(1).max(1000).nullable().optional(),
  trialDays: z.number().int().min(0).max(90).optional(),
  isActive: z.boolean().optional(),
});
export const recordPaymentSchema = z.object({
  amountUzs: z.number().int().min(1).max(1_000_000_000),
  periodMonths: z.number().int().min(1).max(24),
  method: z.enum(['MANUAL', 'BANK_TRANSFER', 'CASH']),
  reference: optionalText(120),
  note: optionalText(300),
  planId: uuid.optional(),
  seats: z.number().int().min(1).max(1000).optional(),
});
export const blockBusinessSchema = z.object({ reason: z.string().trim().min(3).max(300) });
export const changePlanSchema = z.object({ planId: uuid, seats: z.number().int().min(1).max(1000).optional() });

export type CreateBookingInput = z.infer<typeof createBookingSchema>;
export type ManualBookingInput = z.infer<typeof manualBookingSchema>;
export type ServiceInput = z.infer<typeof serviceSchema>;
export type BarberInput = z.infer<typeof barberSchema>;
export type WorkingHoursInput = z.infer<typeof workingHoursSchema>;
export type ScheduleExceptionInput = z.infer<typeof scheduleExceptionSchema>;
export type UpdateBusinessInput = z.infer<typeof updateBusinessSchema>;
