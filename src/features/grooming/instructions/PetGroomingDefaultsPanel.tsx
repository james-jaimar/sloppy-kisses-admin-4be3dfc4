import { useEffect, useState } from "react";
import { toast } from "sonner";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "./GroomingInstructionsForm";
import { usePetGroomingDefaults, useSavePetGroomingDefaults } from "./queries";

const EMPTY: GroomingInstructionsValue = { selections: {}, medical_flags: [], notes: "" };

export function PetGroomingDefaultsPanel({ tenantId, petId }: { tenantId: string; petId: string }) {
  const q = usePetGroomingDefaults(petId);
  const save = useSavePetGroomingDefaults(tenantId);
  const [value, setValue] = useState<GroomingInstructionsValue>(EMPTY);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (q.data) {
      setValue({
        selections: q.data.selections ?? {},
        medical_flags: q.data.medical_flags ?? [],
        notes: q.data.notes ?? "",
      });
    } else if (q.data === null) {
      setValue(EMPTY);
    }
    setDirty(false);
  }, [q.data]);

  async function onSave() {
    try {
      await save.mutateAsync({
        pet_id: petId,
        selections: value.selections,
        medical_flags: value.medical_flags,
        notes: value.notes?.trim() || null,
      });
      toast.success("Grooming defaults saved");
      setDirty(false);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save");
    }
  }

  return (
    <div className="sk-card p-6">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold">Grooming defaults</h3>
          <p className="text-xs text-muted-foreground">Prefilled onto every grooming booking for this pet.</p>
        </div>
        <button
          type="button"
          onClick={onSave}
          disabled={!dirty || save.isPending}
          className="h-9 rounded-lg bg-sk-coral px-3 text-xs font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
        >
          {save.isPending ? "Saving…" : "Save defaults"}
        </button>
      </div>
      <GroomingInstructionsForm
        tenantId={tenantId}
        value={value}
        onChange={(v) => { setValue(v); setDirty(true); }}
      />
    </div>
  );
}