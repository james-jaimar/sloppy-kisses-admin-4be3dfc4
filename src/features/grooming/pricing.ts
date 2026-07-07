import type { GroomingAddon, GroomingPackage } from "@/features/settings/groomingRateCardQueries";

export interface GroomingPricingInput {
  pkg: GroomingPackage | null;
  addons: { addon: GroomingAddon; qty: number }[];
  bookingDate: Date;
  petBirthDate?: Date | null;
  overtimeMinutes?: number;
  mattedSurchargeZar?: number | null;
  sedationSurchargeZar?: number | null;
  isMobile?: boolean;
  loyaltyFreeGroom?: boolean;
  pensionerDiscount?: boolean;
}

export interface GroomingPriceBreakdown {
  base: number;
  addons: number;
  overtime: number;
  matted: number;
  sedation: number;
  travel: number;
  puppyDiscount: number;
  loyaltyDiscount: number;
  pensionerDiscount: number;
  subtotal: number;
  total: number;
  notes: string[];
}

const OVERTIME_RATE_ZAR_PER_15 = 50;

function monthsBetween(from: Date, to: Date) {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function isPensionerEligibleDay(d: Date) {
  // Mon (1) or Wed (3)
  const day = d.getDay();
  return day === 1 || day === 3;
}

/**
 * Compute grooming price. Pure — safe to unit test.
 * Rules encoded from Sloppy Kisses public price list.
 */
export function computeGroomingPrice(input: GroomingPricingInput): GroomingPriceBreakdown {
  const notes: string[] = [];
  const base = input.pkg?.price_zar ?? 0;
  const addons = input.addons.reduce((sum, a) => sum + a.addon.price_zar * (a.qty || 1), 0);
  const overtimeBlocks = Math.max(0, Math.ceil((input.overtimeMinutes ?? 0) / 15));
  const overtime = overtimeBlocks * OVERTIME_RATE_ZAR_PER_15;
  const matted = Number(input.mattedSurchargeZar ?? 0);
  const sedation = Number(input.sedationSurchargeZar ?? 0);
  const travel = input.isMobile ? 0 : 0; // travel is captured as an add-on line; leave 0 here

  // Puppy discount: 50% off base if <6 months at booking date
  let puppyDiscount = 0;
  if (input.petBirthDate) {
    const months = monthsBetween(input.petBirthDate, input.bookingDate);
    if (months < 6) {
      puppyDiscount = base * 0.5;
      notes.push("Puppy discount applied (50% off base)");
    }
  }

  // Loyalty free groom — zero base only, add-ons still charged
  let loyaltyDiscount = 0;
  if (input.loyaltyFreeGroom) {
    loyaltyDiscount = base - puppyDiscount;
    notes.push("Loyalty free groom applied (base only; add-ons still charged)");
  }

  // Pensioner 10% on Mon/Wed — off (base - puppy - loyalty)
  let pensionerDiscount = 0;
  if (input.pensionerDiscount) {
    if (isPensionerEligibleDay(input.bookingDate)) {
      const eligibleBase = Math.max(0, base - puppyDiscount - loyaltyDiscount);
      pensionerDiscount = eligibleBase * 0.1;
      notes.push("Pensioner 10% discount applied (Mon/Wed)");
    } else {
      notes.push("Pensioner discount only valid Mon/Wed — not applied");
    }
  }

  const subtotal = base + addons + overtime + matted + sedation + travel;
  const total = Math.max(0, subtotal - puppyDiscount - loyaltyDiscount - pensionerDiscount);

  return {
    base, addons, overtime, matted, sedation, travel,
    puppyDiscount, loyaltyDiscount, pensionerDiscount,
    subtotal, total, notes,
  };
}

export function formatZar(n: number): string {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR", maximumFractionDigits: 0 }).format(n);
}