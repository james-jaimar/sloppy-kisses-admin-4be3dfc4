# Simpler daycare booking form

Two changes to the staff "New booking" modal (and the same wording in the customer portal repeat controls).

## 1. Daycare: no start time

Daycare runs to fixed times, so asking for a time is noise and lets staff enter odd values like 16:57.

- For service type Daycare and Daycare assessment, the Start field becomes a **date only** picker labelled "Day".
- The time is set automatically to 08:00 (day start), the same way the hotel form already forces a 09:00 arrival.
- Under the date, a small grey line reads: "Daycare day runs 08:00 – 17:00."
- The Duration select stays but is relabelled "How long?" with the options "All day (08:00 – 17:00)" and "Half day (08:00 – 12:00)". Half day also starts at 08:00.
- The "Ends ..." helper line is hidden for daycare (it is now obvious).
- All other services keep the existing date-and-time picker.

## 2. Plain-English repeat wording

Current wording ("Make this a recurring series", "Frequency", "Every", "Ends", "After N occurrences", "Never (60-day rolling window)") is jargon. New wording:

| Now | New |
| --- | --- |
| Repeat / Make this a recurring series | **Same days every week?** / tick box: "Yes, book this again and again" |
| Frequency | **How often** — options: "Every week", "Every 2 weeks", "Every month" |
| Every (number box) | removed; folded into the How often list |
| On (day pills) | **Which days?** |
| Ends | **When does it stop?** |
| After N occurrences | "After a set number of visits" + box labelled "How many visits?" |
| On a specific date | "On a date I choose" + "Last day" |
| Never (60-day rolling window) | "Keep going (we book 60 days ahead)" |

The summary line at the bottom is rewritten in the same voice, e.g. "Every week on Mon and Fri — 3 visits" instead of "Every week on Fri, Mon for 3 occurrences".

Daily repeat is dropped from the list (it was never used for daycare and confuses the choice). Everything else behaves exactly as it does today.

## Technical notes

- `src/features/bookings/BookingFormModal.tsx`: add a `kind === "daycare"` branch to the Start block (date input, appends `T08:00`), relabel duration, adjust the daycare presets so half day is 240 min from 08:00, hide the "Ends" helper.
- `src/features/bookings/RecurrenceFields.tsx`: label changes plus a combined "How often" select that writes `frequency` + `interval`.
- `src/features/bookings/recurrence.ts`: reword `describeRule` output only — the occurrence generator is untouched, so existing series and `recurrence.test.ts` behaviour stay the same.
