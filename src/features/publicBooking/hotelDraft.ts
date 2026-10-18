import type { PetSizeBand } from "@/features/settings/hotelRateCardQueries";
import type { AddressValue } from "@/components/address/AddressField";

export interface HotelDraftPet {
  name: string;
  species: "dog" | "cat";
  size: PetSizeBand | "";
  breed: string;
  accommodation: string;
}

export interface HotelDraft {
  version: 1;
  tenantId: string | null;
  checkIn: string;
  nights: number;
  pets: HotelDraftPet[];
  addons: Record<string, number>;
  transport: { pickup: boolean; dropoff: boolean };
  notes: string;
  contact?: { first_name: string; last_name: string; email: string; mobile: string };
  address?: AddressValue;
}

const KEY = "sk.hotelBookingDraft.v1";
export const HOTEL_PORTAL_PATH = "/customer/bookings/new/hotel";

export function saveHotelDraft(draft: HotelDraft) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ ...draft, expiresAt: Date.now() + 2 * 60 * 60 * 1000 })); } catch { /* Storage may be disabled. */ }
}

export function readHotelDraft(tenantId?: string): HotelDraft | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (d.version !== 1 || typeof d.expiresAt !== "number" || d.expiresAt <= Date.now() || !Array.isArray(d.pets) || typeof d.checkIn !== "string" ||
        !Number.isInteger(d.nights) || d.nights < 1 || typeof d.notes !== "string" ||
        !d.transport || typeof d.transport.pickup !== "boolean" || typeof d.transport.dropoff !== "boolean" || !d.addons ||
        !d.pets.every((p: any) => typeof p.name === "string" && ["dog", "cat"].includes(p.species) && typeof p.accommodation === "string") ||
        !Object.values(d.addons).every(q => typeof q === "number" && Number.isInteger(q) && q >= 0) ||
        (tenantId && d.tenantId !== tenantId)) return null;
    return d as HotelDraft;
  } catch { return null; }
}

export function clearHotelDraft() {
  try { sessionStorage.removeItem(KEY); } catch { /* Storage may be disabled. */ }
}

/** Never match by position, species alone or a partial name. Ambiguous names need a customer choice. */
export function matchDraftPets(draftPets: HotelDraftPet[], savedPets: { id: string; name: string; species: string | null }[]) {
  const matches: { id: string; accommodation: string }[] = [];
  const unmatched: string[] = [];
  const norm = (s: string) => s.trim().toLowerCase();
  for (const p of draftPets) {
    if (!p.name.trim()) continue;
    const candidates = savedPets.filter(s => norm(s.name) === norm(p.name) && norm(s.species ?? "") === p.species);
    const candidate = candidates.length === 1 ? candidates[0] : undefined;
    if (candidate && !matches.some(m => m.id === candidate.id)) matches.push({ id: candidate.id, accommodation: p.accommodation });
    else unmatched.push(p.name);
  }
  return { matches, unmatched };
}