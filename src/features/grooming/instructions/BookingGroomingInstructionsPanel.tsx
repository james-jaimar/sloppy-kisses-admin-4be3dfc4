import { useEffect, useRef } from "react";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "./GroomingInstructionsForm";
import { useBookingInstructions, usePetGroomingDefaults } from "./queries";

export interface BookingInstructionsState {
  value: GroomingInstructionsValue;
  dirty: boolean;
}

/**
 * Controlled panel for a booking's grooming instructions.
 * - Edit mode: seeds from existing booking instructions row.
 * - New booking: seeds from the first selected pet's grooming defaults.
 */
export function BookingGroomingInstructionsPanel({
  tenantId,
  bookingId,
  primaryPetId,
  value,
  onChange,
}: {
  tenantId: string;
  bookingId: string | null;
  primaryPetId: string | null;
  value: GroomingInstructionsValue;
  onChange: (v: GroomingInstructionsValue) => void;
}) {
  const existingQ = useBookingInstructions(bookingId);
  const defaultsQ = usePetGroomingDefaults(bookingId ? null : primaryPetId);
  const seeded = useRef(false);

  // Edit-mode seed
  useEffect(() => {
    if (!bookingId) return;
    if (seeded.current) return;
    if (!existingQ.data) return;
    onChange({
      selections: existingQ.data.selections ?? {},
      medical_flags: existingQ.data.medical_flags ?? [],
      notes: existingQ.data.notes ?? "",
      told_office_to_call: existingQ.data.told_office_to_call ?? "",
    });
    seeded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, existingQ.data]);

  // New-booking seed from pet defaults (only if the form is still empty)
  useEffect(() => {
    if (bookingId) return;
    if (seeded.current) return;
    if (!defaultsQ.data) return;
    const isEmpty =
      Object.keys(value.selections ?? {}).length === 0 &&
      (value.medical_flags?.length ?? 0) === 0 &&
      !value.notes;
    if (!isEmpty) return;
    onChange({
      selections: defaultsQ.data.selections ?? {},
      medical_flags: defaultsQ.data.medical_flags ?? [],
      notes: defaultsQ.data.notes ?? "",
    });
    seeded.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookingId, defaultsQ.data]);

  return (
    <div className="rounded-xl border border-border bg-white p-4">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Grooming instructions
          </div>
          {!bookingId && defaultsQ.data && (
            <div className="text-[11px] text-muted-foreground">Prefilled from this pet's defaults.</div>
          )}
        </div>
      </div>
      <GroomingInstructionsForm tenantId={tenantId} value={value} onChange={onChange} />
      <label className="mt-3 block">
        <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Told office to call
        </div>
        <input
          type="text"
          value={value.told_office_to_call ?? ""}
          onChange={(e) => onChange({ ...value, told_office_to_call: e.target.value })}
          placeholder="e.g. Charlotte — approved shave down"
          className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
        />
      </label>
    </div>
  );
}