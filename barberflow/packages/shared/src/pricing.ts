export type PlanPricingModel = 'FLAT' | 'PER_SEAT';

export interface PlanLike {
  pricing: PlanPricingModel;
  priceUzs: number;
  minSeats: number;
  maxSeats: number | null;
}

/** Billable seats for a plan given the number of active barbers. */
export function billableSeats(plan: PlanLike, activeBarbers: number): number {
  if (plan.pricing === 'FLAT') return 1;
  return Math.max(plan.minSeats, activeBarbers);
}

/** Monthly price in UZS. SOLO: flat. TEAM: per active barber with a minimum seat count. */
export function monthlyPrice(plan: PlanLike, activeBarbers: number): number {
  return plan.pricing === 'FLAT' ? plan.priceUzs : plan.priceUzs * billableSeats(plan, activeBarbers);
}

/** True when the plan cannot hold that many active barbers (e.g. SOLO with 2 barbers). */
export function exceedsPlan(plan: PlanLike, activeBarbers: number): boolean {
  return plan.maxSeats !== null && activeBarbers > plan.maxSeats;
}
