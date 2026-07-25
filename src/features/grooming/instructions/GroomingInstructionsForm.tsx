import { useEffect, useState } from "react";
import { useInstructionCatalog, type Selections } from "./queries";
import { useGroomingAddons } from "@/features/settings/groomingRateCardQueries";

export interface GroomingInstructionsValue {
  selections: Selections;
  medical_flags: string[];
  notes: string;
  told_office_to_call?: string;
}

interface Props {
  tenantId: string | null;
  value: GroomingInstructionsValue;
  onChange: (v: GroomingInstructionsValue) => void;
  disabled?: boolean;
  compact?: boolean;
}

export function GroomingInstructionsForm({ tenantId, value, onChange, disabled, compact }: Props) {
  const catalog = useInstructionCatalog(tenantId);
  const addonsQ = useGroomingAddons(tenantId ?? undefined, { activeOnly: true });
  const [local, setLocal] = useState<GroomingInstructionsValue>(value);

  useEffect(() => { setLocal(value); }, [value]);

  function update(patch: Partial<GroomingInstructionsValue>) {
    const next = { ...local, ...patch };
    setLocal(next);
    onChange(next);
  }

  function setSel(code: string, v: any) {
    update({ selections: { ...local.selections, [code]: v } });
  }

  if (catalog.isLoading) return <div className="text-sm text-muted-foreground">Loading instructions…</div>;
  if (catalog.isError) return <div className="text-sm text-destructive">Failed to load instructions.</div>;
  const { groups, byGroup } = catalog.data!;
  const addonPrice = new Map<string, number>();
  for (const a of addonsQ.data ?? []) addonPrice.set(a.code, Number(a.price_zar));
  const priceHint = (code: string | null | undefined) => {
    if (!code) return "";
    const p = addonPrice.get(code);
    return p ? ` +R${Math.round(p)}` : "";
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      {groups.map((g) => {
        const opts = byGroup[g.id] ?? [];
        const val = local.selections[g.code];
        if (g.is_medical) {
          const selected = Array.isArray(val) ? (val as string[]) : local.medical_flags ?? [];
          return (
            <fieldset key={g.id} className="rounded-lg border border-sk-orange bg-sk-orange-soft p-3">
              <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-sk-orange">{g.label}</legend>
              <div className="flex flex-wrap gap-2">
                {opts.map((o) => {
                  const on = selected.includes(o.code);
                  return (
                    <button key={o.id} type="button" disabled={disabled}
                      onClick={() => {
                        const next = on ? selected.filter((c) => c !== o.code) : [...selected, o.code];
                        update({ medical_flags: next, selections: { ...local.selections, [g.code]: next } });
                      }}
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-sk-orange text-white border-sk-orange" : "bg-white border-border"}`}>
                      {o.label}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        }
        return (
          <fieldset key={g.id} className="rounded-lg border border-border p-3">
            <legend className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</legend>
            {g.kind === "text" && (
              <input type="text" disabled={disabled}
                value={(val as string) ?? ""}
                onChange={(e) => setSel(g.code, e.target.value)}
                className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm" />
            )}
            {g.kind === "number" && (
              <input type="number" disabled={disabled}
                value={(val as number) ?? ""}
                onChange={(e) => setSel(g.code, e.target.value === "" ? null : Number(e.target.value))}
                className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm" />
            )}
            {g.kind === "bool" && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={disabled}
                  checked={Boolean(val)}
                  onChange={(e) => setSel(g.code, e.target.checked)} />
                Yes
              </label>
            )}
            {g.kind === "single" && (
              <div className="flex flex-wrap gap-2">
                {opts.map((o) => {
                  const on = val === o.code;
                  return (
                    <button key={o.id} type="button" disabled={disabled}
                      onClick={() => setSel(g.code, on ? null : o.code)}
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-sk-coral text-white border-sk-coral" : "bg-white border-border"}`}>
                      {o.label}{priceHint(o.addon_code)}
                    </button>
                  );
                })}
              </div>
            )}
            {g.kind === "multi" && (
              <div className="flex flex-wrap gap-2">
                {opts.map((o) => {
                  const arr = Array.isArray(val) ? (val as string[]) : [];
                  const on = arr.includes(o.code);
                  return (
                    <button key={o.id} type="button" disabled={disabled}
                      onClick={() => {
                        const next = on ? arr.filter((c) => c !== o.code) : [...arr, o.code];
                        setSel(g.code, next);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs ${on ? "bg-sk-coral text-white border-sk-coral" : "bg-white border-border"}`}>
                      {o.label}{priceHint(o.addon_code)}
                    </button>
                  );
                })}
              </div>
            )}
          </fieldset>
        );
      })}

      <label className="block">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Free-form notes</div>
        <textarea disabled={disabled} rows={3}
          value={local.notes ?? ""}
          onChange={(e) => update({ notes: e.target.value })}
          className="w-full rounded-md border border-border bg-white p-2 text-sm" />
      </label>
    </div>
  );
}