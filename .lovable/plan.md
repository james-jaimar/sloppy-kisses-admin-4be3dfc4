# Breed catalog → auto-size, mandatory selection

Capture the Sloppy Kisses website's dog-breed-by-size list as a seeded catalog, then wire the pet form so choosing a breed auto-sets the size band. Breed and size become mandatory for dogs.

## 1. Seed catalog (DB)

New table `dog_breeds` (global, not per-tenant — same list for everyone; can be overridden later):

- `name` (unique, text)
- `size_band` — `small | medium | large | xl | xxl` (matches `grooming_size_band` values)
- `active` (bool, default true)
- `sort_order` (int)

Seed rows from the 5 uploaded screenshots (Small 17, Medium 25, Large 25, XL 13, XXL 11). Where a breed appears in two bands (e.g. Dutch Shepherd, Great Pyrenees, Irish Wolfhound), keep the **larger** band — safer for booking length/pricing defaults.

Grants: `SELECT` to `anon, authenticated`; `ALL` to `service_role`. RLS: read-only for everyone, no write policy (managed via migrations / future Settings screen).

## 2. Settings screen (settings-first rule)

`Admin → Settings → Dog breeds` — simple table: name, size, active, sort. Full CRUD gated by an existing catalog permission code (reuse `settings.grooming.manage` or similar — will confirm from `permissions.ts` at build time). This lets Charlotte tweak the list without a developer.

## 3. Pet form UX (admin + portal)

Both `src/features/pets/PetFormModal.tsx` and `src/features/customerPortal/pets/MyPetFormModal.tsx`:

- Replace the free-text **Breed** input with a searchable combobox sourced from `dog_breeds` (only when `species = dog`). Allow "Other / not listed" → falls back to free text + manual size.
- On breed pick, auto-fill **Size** with the mapped band and lock it (with a small "change" link to override manually if needed).
- Validation: for dogs, **breed** and **size** are required (block submit + toast). Cats/other keep current optional behaviour.
- Keep existing `pets.breed` (text) column — we store the chosen name; optionally add `breed_id uuid` FK for analytics later (nice-to-have, not required for v1).

## 4. Where size flows

Size band already drives grooming rate cards, hotel rates, and add-on pricing — no changes needed downstream; this just guarantees the field is populated correctly from day one.

## Out of scope (ask if wanted)

- Cat breed list (site doesn't publish one)
- Backfilling size on existing pets from their current free-text breed (can be a one-off script later)
- Per-tenant breed overrides
