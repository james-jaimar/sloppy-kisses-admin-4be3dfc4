/**
 * Per-dog grooming plan helpers for the staff booking form.
 * Each dog carries its own package, extras and grooming sheet.
 */
import type { GroomingAddonSelection } from "@/features/bookings/GroomingExtrasPanel";
import type { GroomingInstructionsValue } from "@/features/grooming/instructions/GroomingInstructionsForm";
import {
  layoutGroomingAppointments,
  type BusyInterval,
  type GroomerResource,
  type PetSlotRequest,
  type ScheduledPetSlot,
} from "@/features/grooming/multiPetSchedule";

export interface DogPlan {
  packageId: string | null;
  addons: GroomingAddonSelection[];
  instructions: GroomingInstructionsValue;
}

export const EMPTY_INSTRUCTIONS: GroomingInstructionsValue = {
  selections: {},
  medical_flags: [],
  notes: "",
  told_office_to_call: "",
};

export type TimingMode = "together" | "back_to_back" | "custom";

/**
 * Instructions are the source of truth for any add-on linked to an instruction
 * option: add when ticked, remove when un-ticked. Returns `prev` untouched when
 * nothing changes so callers can bail out of state updates.
 */
export function applyInstructionAddons(
  prev: GroomingAddonSelection[],
  selections: Record<string, any>,
  cat: { groups: any[]; options: any[]; byGroup: Record<string, any[]> },
  addons: { id: string; code: string }[],
): GroomingAddonSelection[] {
  const triggered = new Set<string>();
  for (const g of cat.groups) {
    const val = selections[g.code];
    if (g.kind === "bool" && val && g.code === "hand_strip" && addons.some((a) => a.code === "hand_strip")) {
      triggered.add("hand_strip");
    }
    const opts = cat.byGroup[g.id] ?? [];
    if (g.kind === "single" && typeof val === "string") {
      const opt = opts.find((o) => o.code === val);
      if (opt?.addon_code) triggered.add(opt.addon_code);
    }
    if (g.kind === "multi" && Array.isArray(val)) {
      for (const code of val) {
        const opt = opts.find((o) => o.code === code);
        if (opt?.addon_code) triggered.add(opt.addon_code);
      }
    }
  }
  const linkedCodes = new Set<string>(["hand_strip"]);
  for (const o of cat.options) if (o.addon_code) linkedCodes.add(o.addon_code);
  const idFor = (code: string) => addons.find((a) => a.code === code)?.id;
  const triggeredIds = new Set([...triggered].map(idFor).filter(Boolean) as string[]);
  const linkedIds = new Set([...linkedCodes].map(idFor).filter(Boolean) as string[]);

  const kept = prev.filter((s) => !linkedIds.has(s.addon_id) || triggeredIds.has(s.addon_id));
  const have = new Set(kept.map((s) => s.addon_id));
  const additions: GroomingAddonSelection[] = [];
  for (const id of triggeredIds) if (!have.has(id)) additions.push({ addon_id: id, qty: 1 });
  if (kept.length === prev.length && additions.length === 0) return prev;
  return [...kept, ...additions];
}

function atClock(base: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  const d = new Date(base);
  d.setHours(h || 0, m || 0, 0, 0);
  return d;
}

export function clockOf(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Work out when each dog is groomed and by whom for the chosen timing style. */
export function planDogTimes(args: {
  mode: TimingMode;
  resources: GroomerResource[];
  busy: BusyInterval[];
  baseStart: Date;
  pets: PetSlotRequest[];
  preferredResourceId?: string | null;
  excludeBookingIds?: string[];
  customTimes?: Record<string, string>;
}): ScheduledPetSlot[] | null {
  const { mode, resources, busy, baseStart, pets, preferredResourceId, excludeBookingIds, customTimes } = args;
  if (pets.length === 0) return [];

  if (mode === "together") {
    return layoutGroomingAppointments({ resources, busy, baseStart, pets, preferredResourceId, excludeBookingIds });
  }

  if (mode === "back_to_back") {
    const total = pets.reduce((s, p) => s + (p.durationMinutes || 60), 0);
    const first = layoutGroomingAppointments({
      resources,
      busy,
      baseStart,
      pets: [{ petId: "__all__", durationMinutes: total }],
      preferredResourceId,
      excludeBookingIds,
    });
    if (!first || !first[0]) return null;
    let cursor = first[0].start.getTime();
    return pets.map((p, idx) => {
      const start = new Date(cursor);
      const end = new Date(cursor + (p.durationMinutes || 60) * 60000);
      cursor = end.getTime();
      return {
        petId: p.petId,
        resourceId: first[0].resourceId,
        resourceName: first[0].resourceName,
        start,
        end,
        chained: idx > 0,
      };
    });
  }

  // Custom: each dog at its own time; earlier dogs count as busy for later ones.
  const placed: ScheduledPetSlot[] = [];
  const extraBusy: BusyInterval[] = [];
  for (const p of pets) {
    const wanted = customTimes?.[p.petId] ? atClock(baseStart, customTimes[p.petId]) : baseStart;
    const res = layoutGroomingAppointments({
      resources,
      busy: [...busy, ...extraBusy],
      baseStart: wanted,
      pets: [p],
      preferredResourceId,
      excludeBookingIds,
    });
    if (!res || !res[0]) return null;
    placed.push(res[0]);
    extraBusy.push({
      start_at: res[0].start.toISOString(),
      end_at: res[0].end.toISOString(),
      resource_id: res[0].resourceId,
    });
  }
  return placed;
}

/** Same wall-clock time, moved onto another calendar day (yyyy-mm-dd). */
export function moveToDay(d: Date, day: string): Date {
  const [y, m, dd] = day.split("-").map(Number);
  const r = new Date(d);
  r.setFullYear(y, (m || 1) - 1, dd || 1);
  return r;
}

export function dayKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function prettyDay(day: string): string {
  return new Date(`${day}T12:00:00`).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}
