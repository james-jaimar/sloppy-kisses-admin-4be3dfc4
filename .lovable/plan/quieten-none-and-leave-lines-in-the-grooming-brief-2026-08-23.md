# Quieten "None" and "Leave" lines in the grooming brief

## The problem

The brief currently gives every instruction equal weight, so "Accessories: None", "Aircon strip: None" and "Top knot: Leave" sit in the tick list looking exactly like real work. There are 17 such options seeded today (Leave on beard, body, ears, eyebrows, eyes, fringe, face, legs, moustache, skirt, tail, top knot; None on accessories and aircon strip; No trim on nails; No expression on anal glands; No shaving & no cutting on body).

## What changes

### 1. Work mode brief splits in two

The tick list shows only the lines that need doing. Everything that means "do nothing" drops to a single small grey strip under the list:

```text
[icon]  FACE       Neaten up       ( ✓ )
[icon]  TEETH      Gel only        ( ✓ )
[icon]  EYES       Trim            ( ✓ )

Leave alone: Top knot, Accessories, Aircon strip, Beard
```

- Grey, small, struck-through text, no tick boxes, no icons — clearly a non-event.
- The "4/9 done" counter and the sign-off nudge only count real work, so the groomer is never asked to tick something they don't have to do.
- Nothing is deleted: the office's instruction is still visible if the groomer looks for it.
- Applies to mobile and in-house grooming alike, and to the same brief shown on the front desk / admin side.

### 2. "Do nothing" is a real flag, not a guess

- Each grooming instruction option gets a "means: leave it / no action" switch.
- The 17 existing options above are flagged automatically in the same change, so the screens are right immediately.
- Settings → Grooming instructions shows the switch on every option, so anything Charlotte adds later ("Don't touch", "Skip") can be flagged without a developer.

## Technical notes

- Migration: add `no_action boolean not null default false` to `grooming_instruction_options`; backfill `true` where the option code is `none`/`leave`/`no_shaving`/`no_trim` or the label matches `^(none|leave|no [a-z]+)`.
- `InstructionOption` type and `useInstructionCatalog` select gain `no_action`.
- `briefRows.ts`: `BriefRow` gains `noAction: boolean`, set from the matched option (multi-select rows count as no-action only when every chosen option is). Medical rows are never treated as no-action. Tests extended for the new flag.
- `BriefChecklist.tsx`: partitions rows, renders active ones as today, and renders the no-action set as one muted `line-through` sentence; `doneCount`/`total` and the `onProgress` payload use the active rows only, so the JobPage sign-off gate stays correct with no change there.
- `GroomingInstructionsPage.tsx`: add the switch to the option editor and to the upsert payload.
