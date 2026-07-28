import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Wand2 } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthContext";
import { PET_SIZE_LABEL, type PetSize } from "./sizeUtils";

const SIZE_OPTIONS: PetSize[] = ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"];

interface PetLike {
  id: string;
  tenant_id: string;
  size: string | null;
  size_override: string | null;
  size_override_reason: string | null;
  size_override_at: string | null;
}

export function SizeOverrideBadge({ pet }: { pet: Pick<PetLike, "size" | "size_override" | "size_override_reason"> }) {
  if (!pet.size_override) return null;
  return (
    <span
      title={pet.size_override_reason ?? "Set by staff"}
      className="inline-flex items-center gap-1 rounded-full bg-sk-orange-soft px-2 py-0.5 text-[11px] font-semibold text-sk-orange"
    >
      <AlertTriangle className="h-3 w-3" /> Groomed as {PET_SIZE_LABEL[pet.size_override as PetSize] ?? pet.size_override}
      {pet.size ? <span className="font-normal opacity-70">(base {PET_SIZE_LABEL[pet.size as PetSize] ?? pet.size})</span> : null}
    </span>
  );
}

export function SizeOverrideControl({ pet }: { pet: PetLike }) {
  const qc = useQueryClient();
  const { authUser } = useAuth();
  const [override, setOverride] = useState<string>(pet.size_override ?? "");
  const [reason, setReason] = useState<string>(pet.size_override_reason ?? "");
  const dirty = (pet.size_override ?? "") !== override || (pet.size_override_reason ?? "") !== reason;

  const save = useMutation({
    mutationFn: async () => {
      const patch: any = override
        ? {
            size_override: override,
            size_override_reason: reason.trim() || null,
            size_override_by: authUser?.id ?? null,
            size_override_at: new Date().toISOString(),
          }
        : {
            size_override: null,
            size_override_reason: null,
            size_override_by: null,
            size_override_at: null,
          };
      const { error } = await supabase.from("pets").update(patch).eq("id", pet.id).eq("tenant_id", pet.tenant_id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(override ? "Grooming size override saved" : "Grooming size override cleared");
      qc.invalidateQueries({ queryKey: ["pets"] });
      qc.invalidateQueries({ queryKey: ["portal_pet"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <div className="sk-card p-6">
      <div className="mb-2 flex items-center gap-2">
        <Wand2 className="h-4 w-4 text-sk-orange" />
        <h3 className="text-sm font-semibold">Grooming size override</h3>
      </div>
      <p className="mb-3 text-xs text-muted-foreground">
        Force this pet to be billed as a different size for grooming — useful when a Large dog is coat-heavy and should be
        priced as X-Large, or the reverse. The override is shown to the customer and drives package selection & pricing.
      </p>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Override size</div>
          <select
            value={override}
            onChange={(e) => setOverride(e.target.value)}
            className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm"
          >
            <option value="">— No override (use base size) —</option>
            {SIZE_OPTIONS.map((s) => (
              <option key={s} value={s}>{PET_SIZE_LABEL[s]}</option>
            ))}
          </select>
          <div className="mt-1 text-[11px] text-muted-foreground">Base: {pet.size ? PET_SIZE_LABEL[pet.size as PetSize] : "not set"}</div>
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Reason (visible to customer)</div>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Long-haired large breed — priced as X-Large"
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"
          />
        </label>
      </div>
      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={!dirty || save.isPending}
          className="h-9 rounded-lg bg-sk-coral px-4 text-xs font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : override ? "Save override" : "Clear override"}
        </button>
      </div>
    </div>
  );
}