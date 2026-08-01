## Goal

Give customers the same grooming experience staff get in the admin "New booking" modal: set preferences per dog, pick a real available slot, and see only packages that match their dog's (possibly overridden) size — with prices.

## What I verified

- The portal pet page (`/customer/pets/:id`) **does** already render `PetGroomingDefaultsPanel`, and the dashboard nudge links there. So "nothing to set" is not a missing component — something is rendering empty or invisible.
- Database access is not the cause for the instruction catalog: `grooming_instruction_groups` / `grooming_instruction_options` have a policy that explicitly allows a signed-in customer of that tenant to read them (26 active groups, 101 active options), and `pet_grooming_defaults` has a customer-owned policy.
- **Confirmed real gap:** `grooming_packages` and `grooming_addons` only allow `SELECT` where `user_has_tenant_access(tenant_id)` — that is staff-only. A logged-in customer reads **zero rows**, so in the portal booking wizard the package dropdown is empty and add-on price hints (`+R60`, `+R80`) never show. Admin sees them; customer never can.

So the diagnosis for the pet-page symptom is **unconfirmed** — step 1 is to reproduce it as a customer before changing that screen.

## Plan

**1. Reproduce as a customer (first step, no guessing)**
Sign in to the portal as a test customer, open the dashboard nudge → pet page, and capture what actually renders in the grooming panel (loading spinner, "Failed to load instructions", empty fieldsets, or a panel pushed far below the fold). Fix whatever the reproduction shows.

**2. Read access for pricing catalogues**
Migration to add a customer-read policy to `grooming_packages` and `grooming_addons` (active rows only), mirroring the existing pattern on the instruction tables, so the portal can show real packages and add-on prices.

**3. Rebuild the portal "Grooming preferences" surface**
Replace the plain card at the bottom of the pet page with a proper, prominent section matching the admin styling:
- Grouped instruction chips (shampoo, face, teeth, eyes, coat, medical flags) with `+R` price hints now that add-ons are readable.
- Sticky save bar, saved-state confirmation, and a "Not set yet" empty state with a call to action.
- Read-only display of any staff size override, with the reason.
- Reachable from a clear "Grooming preferences" entry on the pet card in `/customer/pets`, not just deep in the detail page.

**4. Align the portal booking wizard with the admin modal**
- Size-filtered package list showing name + price (works once step 2 lands).
- Add-on / instruction chips with price hints, pre-filled from the dog's saved defaults, editable for this booking only.
- Keep the existing `GroomingSlotPicker`; verify slot availability queries succeed under customer RLS (bookings/resources reads) and fix the policies if they don't.
- Running estimate line so the customer sees roughly what the groom will cost before submitting.

## Technical notes

- Files: `src/features/customerPortal/pets/MyPetDetailPage.tsx`, `MyPetsPage.tsx`, `src/features/grooming/instructions/PetGroomingDefaultsPanel.tsx` (or a portal variant), `GroomingInstructionsForm.tsx`, `src/features/customerPortal/bookings/new/GroomingRequestWizard.tsx`, `wizardHooks.ts`.
- One migration for the two new customer-read policies; no schema changes expected.
- Estimate reuses `src/features/grooming/pricing.ts` so portal and admin never diverge.
