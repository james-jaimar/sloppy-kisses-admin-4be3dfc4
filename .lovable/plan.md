## Grooming pricing coverage audit

I checked the seeded instruction catalog against the priced add-ons and packages. Here is what's covered vs. what isn't.

### Included in the base package (no extra charge — correct)
Cosmetic style choices where the option only tells the groomer what to do:
- Face, Eyes, Eyebrows, Fringe, Moustache, Beard, Top knot (trim/cut/shave/leave)
- Body length / breed-specific / strip
- Legs, Tail, Sanitary trim, Paw pads
- Bows/bandana/cologne accessories
- Free-form notes, medical flags

These are styling instructions, not billable line items — correct that they carry no price.

### Instructions that map to a paid add-on (already covered)
| Instruction option | Matching add-on | Price |
|---|---|---|
| Shampoo → Tick & Flea | `shampoo_tick_flea` | R60 |
| Shampoo → Hypoallergenic | `shampoo_hypo` | R80 |
| Teeth → Gel only | included in base | R0 |
| Teeth → Toothbrush purchased/provided | `teeth_toothpaste` | R185 |
| Ears → Clean | `ear_clean` | R130 |

### Gaps found (instructions with no matching add-on / price)
1. **Shampoo upgrades** — catalog offers *De-shedding*, *Purple/Whitening*, *Own shampoo* but only Tick&Flea and Hypoallergenic have prices. Need to decide: seed `shampoo_deshed` and `shampoo_whitening` add-ons (suggest R80 each, matching hypo), and mark `own` as free.
2. **Nails & Anal glands** — priced as add-ons (R130 / R185) but *not* in the instruction catalog, so groomers can't tick them on the digital card. Need to add a `nails` and `anal_glands` group (single: none / trim / express) that auto-selects the matching add-on.
3. **Hand stripping** — priced add-on (R50) but no instruction group. Add under Body as an option.
4. **Stay & Play (R250)** and **Pickup/Drop-off (R140/way)** — priced add-ons but only surfaced in the extras panel, not in the customer/pet instruction form. Fine as-is (they're logistics, not styling), but confirm.
5. **Duplicate add-on**: `nails_trim` and `nail_trim` both exist at R130 — one should be deactivated.
6. **Mobile travel duplicated**: `travel_mobile` and `mobile_travel` both at R110 — deactivate one.

### Proposed fixes (one migration + tiny UI wiring)
1. Migration:
   - Deactivate duplicate add-ons `nail_trim` and `mobile_travel` (keep `nails_trim`, `travel_mobile`).
   - Insert add-ons: `shampoo_deshed` (R80), `shampoo_whitening` (R80).
   - Insert instruction groups: `nails` (single: none/trim), `anal_glands` (single: none/express), plus a `hand_strip` boolean under Body.
   - Add optional `addon_code` column to `grooming_instruction_options` so a ticked instruction can auto-add the matching priced add-on on the booking.
2. UI:
   - In `GroomingExtrasPanel` / booking save, when an instruction option carries an `addon_code`, auto-toggle that add-on in the price preview (still editable).
   - Show a small "+R…" hint next to instruction options that trigger a charge, so staff/customers see the cost while ticking.
3. Settings:
   - Extend `GroomingInstructionsPage` so each option row can pick an add-on from the rate card (keeps the settings-first rule; Charlotte controls the mapping).

### Out of scope for this pass
- Sedation fee (already handled via workflow settings + consent flow).
- Weekend/birthday parties (parked earlier).
- Cat-specific rate variants beyond what's already seeded.

Approve and I'll ship the migration + wiring in one go.
