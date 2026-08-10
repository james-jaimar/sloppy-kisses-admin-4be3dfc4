/**
 * Multi-dog grooming scheduling.
 *
 * When an owner brings two or more dogs, each dog is its own appointment (its own
 * package, its own time on a groomer). If more than one groomer is free at the
 * requested time the dogs run in parallel; otherwise they chain back-to-back on
 * whichever groomer frees up first.
 */

export interface BusyInterval {
  id?: string;
  start_at: string;
  end_at: string | null;
  resource_id: string | null;
}

export interface GroomerResource {
  id: string;
  name: string;
  colour?: string | null;
}

export interface PetSlotRequest {
  petId: string;
  durationMinutes: number;
}

export interface ScheduledPetSlot {
  petId: string;
  resourceId: string | null;
  resourceName: string | null;
  start: Date;
  end: Date;
  /** true when this dog could not start at the requested time and was pushed later. */
  chained: boolean;
}

interface Interval { start: number; end: number }

const DEFAULT_MINUTES = 60;

function toInterval(b: BusyInterval): Interval {
  const start = new Date(b.start_at).getTime();
  const end = b.end_at ? new Date(b.end_at).getTime() : start + DEFAULT_MINUTES * 60000;
  return { start, end };
}

function overlaps(list: Interval[], start: number, end: number) {
  return list.some((i) => i.start < end && i.end > start);
}

/**
 * Lay existing bookings onto the groomers. Bookings without a resource are
 * greedily parked on the first groomer that is free for that window, which
 * mirrors how the pool behaves today.
 */
function seedBusy(resources: GroomerResource[], busy: BusyInterval[], excludeIds: string[]) {
  const byResource = new Map<string, Interval[]>();
  for (const r of resources) byResource.set(r.id, []);

  const rows = busy.filter((b) => !(b.id && excludeIds.includes(b.id)));
  const assigned = rows.filter((b) => b.resource_id && byResource.has(b.resource_id));
  const floating = rows.filter((b) => !b.resource_id || !byResource.has(b.resource_id));

  for (const b of assigned) byResource.get(b.resource_id as string)!.push(toInterval(b));

  for (const b of floating.sort((a, z) => new Date(a.start_at).getTime() - new Date(z.start_at).getTime())) {
    const iv = toInterval(b);
    const target = resources.find((r) => !overlaps(byResource.get(r.id)!, iv.start, iv.end));
    if (target) byResource.get(target.id)!.push(iv);
  }
  return byResource;
}

export interface LayoutArgs {
  resources: GroomerResource[];
  busy: BusyInterval[];
  /** Requested start for the first dog. */
  baseStart: Date;
  pets: PetSlotRequest[];
  /** Force the first dog (and, if free, the rest) onto this groomer. */
  preferredResourceId?: string | null;
  /** Booking ids to ignore (edit mode). */
  excludeBookingIds?: string[];
  /** Latest time an appointment may still start (local hour, 24h). */
  closeHour?: number;
}

/**
 * Returns one slot per pet, or null when the day cannot fit them all.
 */
export function layoutGroomingAppointments({
  resources,
  busy,
  baseStart,
  pets,
  preferredResourceId = null,
  excludeBookingIds = [],
  closeHour = 17,
}: LayoutArgs): ScheduledPetSlot[] | null {
  if (pets.length === 0) return [];
  const list = resources.length > 0 ? resources : [];
  // No groomer records at all — chain sequentially with no resource assignment.
  if (list.length === 0) {
    let cursor = baseStart.getTime();
    return pets.map((p, idx) => {
      const start = new Date(cursor);
      const end = new Date(cursor + (p.durationMinutes || DEFAULT_MINUTES) * 60000);
      cursor = end.getTime();
      return { petId: p.petId, resourceId: null, resourceName: null, start, end, chained: idx > 0 };
    });
  }

  const ordered = preferredResourceId
    ? [...list].sort((a, b) => (a.id === preferredResourceId ? -1 : b.id === preferredResourceId ? 1 : 0))
    : list;
  const byResource = seedBusy(list, busy, excludeBookingIds);

  const dayClose = new Date(baseStart);
  dayClose.setHours(closeHour, 0, 0, 0);

  const out: ScheduledPetSlot[] = [];
  for (const pet of pets) {
    const dur = (pet.durationMinutes || DEFAULT_MINUTES) * 60000;
    let candidate = baseStart.getTime();
    let placed: ScheduledPetSlot | null = null;

    for (let guard = 0; guard < 60 && !placed; guard++) {
      if (candidate + dur > dayClose.getTime()) return null;
      for (const r of ordered) {
        const ivs = byResource.get(r.id)!;
        if (!overlaps(ivs, candidate, candidate + dur)) {
          ivs.push({ start: candidate, end: candidate + dur });
          placed = {
            petId: pet.petId,
            resourceId: r.id,
            resourceName: r.name,
            start: new Date(candidate),
            end: new Date(candidate + dur),
            chained: candidate > baseStart.getTime(),
          };
          break;
        }
      }
      if (placed) break;
      // Everyone busy — jump to the soonest moment a groomer frees up.
      const nextFree = Math.min(
        ...ordered.map((r) => {
          const blocking = byResource
            .get(r.id)!
            .filter((i) => i.start < candidate + dur && i.end > candidate)
            .map((i) => i.end);
          return blocking.length ? Math.max(...blocking) : candidate;
        }),
      );
      candidate = nextFree > candidate ? nextFree : candidate + 15 * 60000;
    }
    if (!placed) return null;
    out.push(placed);
  }
  return out;
}

/** True when every pet can be seated somewhere starting at `baseStart`. */
export function canSeatAll(args: LayoutArgs): boolean {
  return layoutGroomingAppointments(args) !== null;
}