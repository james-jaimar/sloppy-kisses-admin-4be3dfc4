# Link the in-house grooming calendar to the real groomers

## What I found (verified)

- The availability function behind the booking calendar (`grooming_day_availability`) pools **in-house groomer stations and mobile vans together**. There are 4 groomer stations and 3 vans active, so the calendar treats every day as having a capacity of **7** for an in-house groom, and a van job blocks in-house capacity (and vice versa).
- With no groomer chosen, the slot picker only counts overlaps against that pooled number — it never checks *which* groomer is free. With a groomer chosen it filters to that one groomer, but the grid then shows nothing about the other three.
- Working hours are hardcoded 08:00–17:00 in the picker. The groomer records already carry per-groomer workday start/end (all 08:00–17:00 today), and there is a `closures` table that the grooming calendar ignores, so closed days still show as bookable.

## What changes

### 1. Split grooming capacity by service

The availability function returns in-house stations and mobile vans as separate pools with their own busy lists. An in-house booking is only measured against the 4 groomer stations; a mobile job only against the 3 vans. The picker asks for the pool that matches the service type on the booking form.

### 2. Free/busy across all groomers, visible at a glance

The slot grid gains a per-groomer read-out instead of a single free/taken tick:

```text
09:00   G1 ● G2 ● G3 ○ G4 ●     3 of 4 free
09:15   G1 ● G2 ○ G3 ○ G4 ●     2 of 4 free
10:00   G1 ○ G2 ○ G3 ○ G4 ○     Full
```

- Each slot button shows how many groomers are free ("3 of 4"), with a compact dot row in each groomer's colour — filled = free, hollow = busy.
- Hovering or tapping a slot names the free groomers.
- A slot is only disabled when **no** groomer can take the job (or, for a multi-dog booking, when the dogs can't all be seated).
- With a specific groomer selected, that groomer's own free/busy drives the disabling and the other lanes stay visible as context, so front desk can see "Groomer 1 is full at 10:00 but Groomer 3 is open".
- The "Auto" option stays: leave the groomer blank and the booking is placed on the first free groomer for the chosen slot.

### 3. Real opening hours and closures

- Slot range comes from the groomers' workday start/end rather than a hardcoded 08:00–17:00, using the widest window across active groomers, and slots outside an individual groomer's hours count that groomer as unavailable.
- Days marked in `closures` (and grooming-relevant public holidays) render as closed in the month grid, greyed with a "Closed" label, and cannot be selected.

### 4. Groomer dropdown reflects the day

The "Groomer / station" dropdown on the booking form lists only in-house stations for an in-house groom (vans for a mobile job), each with its colour dot and a free/busy hint for the currently selected time.

## Technical notes

- Migration replaces `grooming_day_availability` with a version returning `{ inhouse: { resources, busy }, mobile: { resources, busy }, closures }`, filtering busy rows by `service_type` to match the pool, keeping the existing security-definer tenant/customer access check and the anonymous busy payload (no pet or customer data). `availabilityQueries.ts` gains a `kind: "inhouse" | "mobile"` argument, defaulting to in-house, with the shape kept backwards-compatible for the portal wizard.
- `GroomingSlotPicker.tsx` computes per-resource availability using the existing `multiPetSchedule` helpers (`seedBusy` logic reused via an exported `freeResourcesAt(...)`), so single-dog and multi-dog paths share one code path.
- `BookingFormModal.tsx` passes the service kind to the picker and filters the resource dropdown by `resources.type`; `GroomingRequestWizard.tsx` (portal) picks up the same pool split.
- Closure days come from the existing `closures` table via the same RPC, so no extra round trip.
- Colours use existing semantic tokens plus each groomer's stored colour; the three vans have no colour set today and fall back to the neutral token.
