import type { InstructionGroup, InstructionOption, Selections } from "@/features/grooming/instructions/queries";

export interface BriefRow {
  code: string;
  label: string;
  value: string;
  icon: string | null;
  colour: string | null;
  isMedical: boolean;
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
    const labelFor = (code: string) => opts.find((o) => o.code === code)?.label ?? code;
    let value = "";
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      value = raw.map((c) => labelFor(String(c))).join(", ");
    } else if (typeof raw === "boolean") {
      value = "Yes";
    } else {
      value = opts.length ? labelFor(String(raw)) : String(raw);
    }
    out.push({
      code: g.code,
      label: g.label,
      value,
      icon: g.icon ?? null,
      colour: g.colour ?? null,
      isMedical: Boolean(g.is_medical),
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
