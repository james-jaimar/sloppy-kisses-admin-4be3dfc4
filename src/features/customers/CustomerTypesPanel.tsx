import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Tags } from "lucide-react";
import { CUSTOMER_TYPES, CUSTOMER_TYPE_META } from "./customerTypes";
import { CustomerTypeChips } from "./CustomerTypeChips";
import { useUpdateCustomer } from "./queries";

export function CustomerTypesPanel({
  tenantId,
  customerId,
  types,
  excluded,
}: {
  tenantId: string;
  customerId: string;
  types: string[] | null | undefined;
  excluded: string[] | null | undefined;
}) {
  const [editing, setEditing] = useState(false);
  const update = useUpdateCustomer(tenantId);
  const current = useMemo(() => new Set(types ?? []), [types]);
  const currentExcluded = useMemo(() => new Set(excluded ?? []), [excluded]);

  async function toggle(code: string) {
    const on = current.has(code);
    const nextTypes = on
      ? (types ?? []).filter((t) => t !== code)
      : [...(types ?? []), code];
    const nextExcluded = on
      ? Array.from(new Set([...(excluded ?? []), code]))
      : (excluded ?? []).filter((t) => t !== code);
    try {
      await update.mutateAsync({
        id: customerId,
        patch: { customer_types: nextTypes, customer_types_excluded: nextExcluded } as any,
      });
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to update types");
    }
  }

  return (
    <div className="sk-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Tags className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Customer type</h3>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          {editing ? "Done" : "Edit"}
        </button>
      </div>

      {!editing && (
        <>
          <CustomerTypeChips types={types} />
          {(types ?? []).length === 0 && (
            <div className="text-xs text-muted-foreground">
              No types yet — they're added automatically the first time this customer books a service.
            </div>
          )}
        </>
      )}

      {editing && (
        <div className="flex flex-wrap gap-2">
          {CUSTOMER_TYPES.map((code) => {
            const on = current.has(code);
            return (
              <button
                key={code}
                disabled={update.isPending}
                onClick={() => toggle(code)}
                className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                  on
                    ? CUSTOMER_TYPE_META[code].className
                    : "border border-dashed border-border text-muted-foreground hover:bg-muted"
                }`}
              >
                {CUSTOMER_TYPE_META[code].label}
                {!on && currentExcluded.has(code) ? " · removed" : ""}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
