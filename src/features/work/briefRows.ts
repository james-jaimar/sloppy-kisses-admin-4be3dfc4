import type { InstructionGroup, InstructionOption, Selections } from "@/features/grooming/instructions/queries";

export interface BriefRow {
  code: string;
  label: string;
  value: string;
  icon: string | null;
  colour: string | null;
  isMedical: boolean;
  /** Selection means "do nothing" — shown as a quiet, struck-through footnote. */
  noAction: boolean;
}

export interface Catalog {
  groups: InstructionGroup[];
  byGroup: Record<string, InstructionOption[]>;
}

/** Turn stored selection codes into human rows, keeping each group's icon/colour. */
export function briefRows(
  selections: Selections | null | undefined,
  catalog: Catalog | null | undefined,
): BriefRow[] {
  if (!catalog || !selections) return [];
  const out: BriefRow[] = [];
  for (const g of catalog.groups) {
    const raw = (selections as any)[g.code];
    if (raw === null || raw === undefined || raw === "" || raw === false) continue;
    const opts = catalog.byGroup[g.id] ?? [];
    const optFor = (code: string) => opts.find((o) => o.code === code);
    const labelFor = (code: string) => optFor(code)?.label ?? code;
    let value = "";
    let noAction = false;
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      value = raw.map((c) => labelFor(String(c))).join(", ");
      // Only a non-event when every chosen option is a non-event.
      noAction = raw.every((c) => Boolean(optFor(String(c))?.no_action));
    } else if (typeof raw === "boolean") {
      value = "Yes";
    } else {
      const opt = optFor(String(raw));
      value = opts.length ? (opt?.label ?? String(raw)) : String(raw);
      noAction = Boolean(opt?.no_action);
    }
    const isMedical = Boolean(g.is_medical);
    out.push({
      code: g.code,
      label: g.label,
      value,
      icon: g.icon ?? null,
      colour: g.colour ?? null,
      isMedical,
      // Safety items always stay loud.
      noAction: isMedical ? false : noAction,
    });
  }
  // Safety-critical groups first.
  return [...out.filter((r) => r.isMedical), ...out.filter((r) => !r.isMedical)];
}

export function medicalFlagLabels(codes: string[], catalog: Catalog | null | undefined): string[] {
  if (!catalog) return codes;
  return codes.map((code) => {
    for (const g of catalog.groups) {
      const hit = (catalog.byGroup[g.id] ?? []).find((o) => o.code === code);
      if (hit) return hit.label;
    }
    return code;
  });
}
