import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { SERVICE_OPTIONS } from "../portalCommon";

interface Props {
  customerId: string;
  tenantId: string;
  relatedBookingId?: string;
  kind?: "new" | "change" | "cancel";
  onClose: () => void;
}

export function NewBookingRequestModal({ customerId, tenantId, relatedBookingId, kind = "new", onClose }: Props) {
  const qc = useQueryClient();
  const [serviceType, setServiceType] = useState("daycare");
  const [petId, setPetId] = useState<string>("");
  const [preferredStart, setPreferredStart] = useState("");
  const [preferredEnd, setPreferredEnd] = useState("");
  const [notes, setNotes] = useState("");

  const pets = useQuery({
    queryKey: ["portal_pets_for_request", customerId],
    queryFn: async () => {
      const { data, error } = await supabase.from("pets").select("id, name").eq("customer_id", customerId).eq("status", "active").order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const submit = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("booking_requests").insert({
        tenant_id: tenantId,
        customer_id: customerId,
        pet_id: petId || null,
        source: "customer_portal",
        service_type: serviceType as any,
        preferred_start_at: preferredStart ? new Date(preferredStart).toISOString() : null,
        preferred_end_at: preferredEnd ? new Date(preferredEnd).toISOString() : null,
        customer_notes: notes.trim() || null,
        status: "pending" as any,
        kind: kind as any,
        related_booking_id: relatedBookingId ?? null,
        request_payload: {},
      } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success(kind === "cancel" ? "Cancellation requested" : kind === "change" ? "Change requested" : "Booking request sent");
      qc.invalidateQueries({ queryKey: ["portal_bookings"] });
      qc.invalidateQueries({ queryKey: ["portal_dash_upcoming"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to send"),
  });

  const isCancel = kind === "cancel";

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {kind === "cancel" ? "Request cancellation" : kind === "change" ? "Request change" : "New booking request"}
          </h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>

        {!isCancel && (
          <div className="space-y-3 text-sm">
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Service</div>
              <select value={serviceType} onChange={(e) => setServiceType(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm">
                {SERVICE_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Pet</div>
              <select value={petId} onChange={(e) => setPetId(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm">
                <option value="">Select pet…</option>
                {(pets.data ?? []).map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Preferred start</div>
                <input type="datetime-local" value={preferredStart} onChange={(e) => setPreferredStart(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </label>
              <label className="block">
                <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Preferred end</div>
                <input type="datetime-local" value={preferredEnd} onChange={(e) => setPreferredEnd(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </label>
            </div>
          </div>
        )}

        <label className="mt-3 block text-sm">
          <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{isCancel ? "Reason" : "Notes"}</div>
          <textarea rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending || (!isCancel && !petId)}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            {submit.isPending ? "Sending…" : "Send request"}
          </button>
        </div>
      </div>
    </div>
  );
}