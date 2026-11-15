import { Injectable } from '@nestjs/common';
import type { PublicBusiness } from '@barberflow/shared';
import { notFound } from '../common/errors';
import { PrismaService } from '../common/prisma.service';
import { isSubscriptionUsable } from '../booking/booking.service';

@Injectable()
export class PublicService {
  constructor(private readonly prisma: PrismaService) {}

  async businessBySlug(slug: string): Promise<PublicBusiness> {
    const business = await this.prisma.business.findUnique({
      where: { slug },
      include: {
        subscription: true,
        services: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] },
        barbers: {
          where: { isActive: true },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          include: { services: true },
        },
      },
    });
    // Blocked businesses are hidden entirely from the public.
    if (!business || business.status === 'BLOCKED') throw notFound('Business');
    const activeServiceIds = new Set(business.services.map((s) => s.id));
    return {
      id: business.id,
      slug: business.slug,
      name: business.name,
      city: business.city,
      address: business.address,
      phone: business.phone,
      description: business.description,
      coverUrl: business.coverUrl,
      latitude: business.latitude,
      longitude: business.longitude,
      timezone: business.timezone,
      cancellationPolicy: business.cancellationPolicy,
      cancellationMinHours: business.cancellationMinHours,
      bookingHorizonDays: business.bookingHorizonDays,
      acceptingBookings: isSubscriptionUsable(business.subscription),
      services: business.services.map((s) => ({
        id: s.id, name: s.name, nameUz: s.nameUz, description: s.description, priceUzs: s.priceUzs, durationMin: s.durationMin,
      })),
      barbers: business.barbers.map((b) => {
        const links = b.services.filter((l) => activeServiceIds.has(l.serviceId));
        const prices: Record<string, { priceUzs: number; durationMin: number }> = {};
        for (const l of links) {
          const s = business.services.find((x) => x.id === l.serviceId)!;
          prices[l.serviceId] = { priceUzs: l.priceOverrideUzs ?? s.priceUzs, durationMin: l.durationOverride ?? s.durationMin };
        }
        return {
          id: b.id, slug: b.slug, name: b.name, specialization: b.specialization, bio: b.bio, photoUrl: b.photoUrl,
          serviceIds: links.map((l) => l.serviceId), prices,
        };
      }),
    };
  }

  async barberBySlug(slug: string) {
    const barber = await this.prisma.barber.findUnique({ where: { slug }, include: { business: { select: { slug: true, status: true } } } });
    if (!barber || !barber.isActive || barber.business.status === 'BLOCKED') throw notFound('Barber');
    return { barberId: barber.id, businessSlug: barber.business.slug };
  }

  plans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { isActive: true },
      orderBy: { priceUzs: 'desc' },
      select: { id: true, code: true, name: true, description: true, pricing: true, priceUzs: true, minSeats: true, maxSeats: true, trialDays: true },
    });
  }
}
