import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Send, Save } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { supabase } from "@/lib/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { GroomingInstructionsForm, type GroomingInstructionsValue } from "./GroomingInstructionsForm";
import {
  useBookingInstructions,
  usePetGroomingDefaults,
  useSaveBookingInstructions,
  useSavePetGroomingDefaults,
} from "./queries";

const EMPTY: GroomingInstructionsValue = { selections: {}, medical_flags: [], notes: "", told_office_to_call: "" };

export function BookingGroomingPrefsDialog({
  tenantId,
  bookingId,
  petId,
  petName,
  customerId,
  open,
  onClose,
}: {
  tenantId: string | null;
  bookingId: string;
  petId: string | null;
  petName?: string | null;
  customerId?: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const existingQ = useBookingInstructions(open ? bookingId : null);
  const defaultsQ = usePetGroomingDefaults(open ? petId : null);
  const saveBooking = useSaveBookingInstructions(tenantId ?? "");
  const saveDefaults = useSavePetGroomingDefaults(tenantId ?? "");

  const [value, setValue] = useState<GroomingInstructionsValue>(EMPTY);
  const [alsoDefaults, setAlsoDefaults] = useState(true);
  const [seeded, setSeeded] = useState(false);
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    if (!open) {
      setSeeded(false);
      setValue(EMPTY);
      return;
    }
    if (seeded) return;
    if (existingQ.isLoading || defaultsQ.isLoading) return;
    const src = existingQ.data ?? defaultsQ.data ?? null;
    setValue({
      selections: (src as any)?.selections ?? {},
      medical_flags: (src as any)?.medical_flags ?? [],
      notes: (src as any)?.notes ?? "",
      told_office_to_call: (existingQ.data as any)?.told_office_to_call ?? "",
    });
    setSeeded(true);
  }, [open, seeded, existingQ.isLoading, existingQ.data, defaultsQ.isLoading, defaultsQ.data]);

  async function save() {
    if (!tenantId) return;
    try {
      await saveBooking.mutateAsync({
        booking_id: bookingId,
        selections: value.selections,
        medical_flags: value.medical_flags,
        notes: value.notes || null,
        told_office_to_call: value.told_office_to_call || null,
      });
      if (alsoDefaults && petId) {
        await saveDefaults.mutateAsync({
          pet_id: petId,
          selections: value.selections,
          medical_flags: value.medical_flags,
          notes: value.notes || null,
        });
      }
      qc.invalidateQueries({ queryKey: ["grooming_prefs_states"] });
      toast.success("Grooming preferences saved");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save preferences");
    }
  }

  async function requestFromCustomer() {
    if (!tenantId || !customerId) {
      toast.error("No customer on this booking");
      return;
    }
    setRequesting(true);
    try {
      const [{ data: cust }, { data: tenantRow }] = await Promise.all([
        supabase.from("customers").select("id, full_name, email").eq("id", customerId).maybeSingle(),
        supabase.from("tenants").select("app_url, name").eq("id", tenantId).maybeSingle(),
      ]);
      const email = (cust as any)?.email as string | null;
      if (!email) {
        toast.error("This customer has no email address on file");
        return;
      }
      const base = ((tenantRow as any)?.app_url ?? window.location.origin).replace(/\/+$/, "");
      const link = petId ? `${base}/customer/pets/${petId}#grooming` : `${base}/customer/pets`;
      const who = (cust as any)?.full_name ?? "there";
      const pet = petName ?? "your dog";
      const { error } = await supabase.from("notification_events").insert({
        tenant_id: tenantId,
        event_type: "manual_message",
        channel: "email",
        customer_id: customerId,
        booking_id: bookingId,
        pet_id: petId,
        recipient_email: email,
        template_key: "grooming_prefs_request",
        subject: `Grooming preferences for ${pet}`,
        body_rendered:
          `Hi ${who},\n\n` +
          `Before ${pet}'s grooming appointment, please let us know how you'd like the groom done — ` +
          `coat length, style, any sensitive spots or medical notes.\n\n` +
          `You can set it here: ${link}\n\n` +
          `Thank you!`,
        payload: { reason: "grooming_prefs_request", link },
      } as any);
      if (error) throw error;
      toast.success("Request queued to the customer");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to queue request");
    } finally {
      setRequesting(false);
    }
  }

  if (!open) return null;

  return (
    <ModalShell
      onClose={onClose}
      title={`Grooming preferences — ${petName ?? "pet"}`}
      subtitle="Capture what the owner wants so the groomer isn't waiting on the day."
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={requestFromCustomer}
            disabled={requesting || !customerId}
            className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Send className="h-4 w-4" /> Request from customer
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 rounded-xl border border-border bg-white px-4 text-sm font-medium hover:bg-muted"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={saveBooking.isPending || saveDefaults.isPending}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
            >
              <Save className="h-4 w-4" /> Save preferences
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {!existingQ.data && defaultsQ.data && (
          <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-xs text-muted-foreground">
            Prefilled from this pet's saved profile preferences.
          </div>
        )}
        <GroomingInstructionsForm tenantId={tenantId} value={value} onChange={setValue} />
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Told office to call
          </div>
          <input
            type="text"
            value={value.told_office_to_call ?? ""}
            onChange={(e) => setValue({ ...value, told_office_to_call: e.target.value })}
            placeholder="e.g. Charlotte — approved shave down"
            className="h-9 w-full rounded-md border border-border bg-white px-2 text-sm"
          />
        </label>
        {petId && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alsoDefaults}
              onChange={(e) => setAlsoDefaults(e.target.checked)}
            />
            Also save as {petName ?? "this pet"}'s default preferences
          </label>
        )}
      </div>
    </ModalShell>
  );
}
