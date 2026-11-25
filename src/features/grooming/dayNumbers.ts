/** Crate/tag numbers for the parlour day: one number per dog, first appointment first, then station order. */
export function groomDayNumbers(
  jobs: { id: string; start_at: string | null; station: string; pets: { id: string }[] }[],
): Map<string, number> {
  const sorted = [...jobs].sort(
    (a, b) =>
      (a.start_at ?? "").localeCompare(b.start_at ?? "") ||
      a.station.localeCompare(b.station, undefined, { numeric: true }) ||
      a.id.localeCompare(b.id),
  );
  const out = new Map<string, number>();
  let n = 1;
  for (const j of sorted) for (const p of j.pets) out.set(`${j.id}:${p.id}`, n++);
  return out;
}
