/** Parlour intake sheet: pets grouped by owner (owners in crate-number order), alternating colour band per owner. */
export interface IntakeInput {
  bookingId: string;
  customerId: string | null;
  petId: string;
  number: number | undefined;
}
export interface IntakeRow extends IntakeInput { band: number; firstOfOwner: boolean; ownerSize: number }

export function buildIntakeRows(items: IntakeInput[], bandCount = 4): IntakeRow[] {
  const num = (i: IntakeInput) => i.number ?? Number.MAX_SAFE_INTEGER;
  const groups = new Map<string, IntakeInput[]>();
  for (const i of items) {
    const key = i.customerId ?? `none:${i.bookingId}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(i);
  }
  const ordered = [...groups.values()]
    .map((g) => g.sort((a, b) => num(a) - num(b)))
    .sort((a, b) => num(a[0]) - num(b[0]));
  return ordered.flatMap((g, gi) =>
    g.map((i, idx) => ({ ...i, band: gi % bandCount, firstOfOwner: idx === 0, ownerSize: g.length })),
  );
}
