import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Check, Scissors, ChevronDown } from "lucide-react";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "./GroomingInstructionsForm";
import { usePetGroomingDefaults, useSavePetGroomingDefaults } from "./queries";

const EMPTY: GroomingInstructionsValue = { selections: {}, medical_flags: [], notes: "" };

interface Props {
  tenantId: string;
  petId: string;
  /** Customer-facing copy + sticky save bar for the portal. */
  variant?: "admin" | "portal";
  petName?: string | null;
  /** Portal: collapse the (long) form behind a header toggle. */
  collapsible?: boolean;
  defaultOpen?: boolean;
}

export function PetGroomingDefaultsPanel({ tenantId, petId, variant = "admin", petName, collapsible = false, defaultOpen = false }: Props) {
  const q = usePetGroomingDefaults(petId);
  const save = useSavePetGroomingDefaults(tenantId);
  const [value, setValue] = useState<GroomingInstructionsValue>(EMPTY);
  const [dirty, setDirty] = useState(false);
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => { if (defaultOpen) setOpen(true); }, [defaultOpen]);

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

  const portal = variant === "portal";
  const isSet = Boolean(q.data);
  const bodyVisible = !collapsible || open;

  return (
    <div className={portal ? "sk-card overflow-hidden p-0 scroll-mt-24" : "sk-card p-6"}>
      <div
        onClick={collapsible ? () => setOpen((v) => !v) : undefined}
        className={
          (portal ? "flex flex-wrap items-start justify-between gap-3 bg-sk-coral-soft/50 p-5" : "mb-3 flex items-center justify-between") +
          (portal && bodyVisible ? " border-b border-border" : "") +
          (collapsible ? " cursor-pointer" : "")
        }
      >
        <div className="flex items-start gap-3">
          {portal && (
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-sk-coral text-white">
              <Scissors className="h-4 w-4" />
            </span>
          )}
          <div>
            <h3 className={portal ? "text-base font-semibold" : "text-sm font-semibold"}>
              {portal ? `Grooming preferences${petName ? ` for ${petName}` : ""}` : "Grooming defaults"}
            </h3>
            <p className="text-xs text-muted-foreground">
              {portal
                ? "Tell us how you like the coat, face, ears and nails done. Saved once — we pre-fill it on every grooming booking."
                : "Prefilled onto every grooming booking for this pet."}
            </p>
            {portal && (
              <span
                className={
                  "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold " +
                  (isSet ? "bg-sk-coral-soft text-sk-coral-dark" : "bg-sk-orange-soft text-sk-orange")
                }
              >
                {isSet ? <><Check className="h-3 w-3" /> Saved</> : "Not set yet"}
              </span>
            )}
          </div>
        </div>
        {collapsible && (
          <ChevronDown className={"h-4 w-4 shrink-0 text-muted-foreground transition-transform " + (open ? "rotate-180" : "")} />
        )}
        {!portal && (
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || save.isPending}
            className="h-9 rounded-lg bg-sk-coral px-3 text-xs font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save defaults"}
          </button>
        )}
      </div>
      {bodyVisible && (
      <div className={portal ? "p-5" : ""}>
        <GroomingInstructionsForm
          tenantId={tenantId}
          value={value}
          onChange={(v) => { setValue(v); setDirty(true); }}
        />
      </div>
      )}
      {portal && bodyVisible && (
        <div className="sticky bottom-0 flex items-center justify-between gap-3 border-t border-border bg-white/95 p-4 backdrop-blur">
          <span className="text-xs text-muted-foreground">
            {dirty ? "You have unsaved changes." : isSet ? "All changes saved." : "Nothing saved yet."}
          </span>
          <button
            type="button"
            onClick={onSave}
            disabled={!dirty || save.isPending}
            className="h-10 rounded-lg bg-sk-coral px-5 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save preferences"}
          </button>
        </div>
      )}
    </div>
  );
}