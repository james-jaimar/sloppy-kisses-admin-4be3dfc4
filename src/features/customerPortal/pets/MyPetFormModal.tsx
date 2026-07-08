import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

interface Props {
  customerId: string;
  tenantId: string;
  pet?: {
    id: string;
    name: string | null;
    species: string | null;
    breed: string | null;
    size: string | null;
    sex: string | null;
    date_of_birth: string | null;
    microchip_number: string | null;
    medical_notes: string | null;
    behaviour_notes: string | null;
  };
  onClose: () => void;
}

const SPECIES = ["dog", "cat", "other"];
const SIZES = ["xsmall", "small", "medium", "large", "xlarge", "xxlarge"];
const SEXES = ["male", "female", "unknown"];

export function MyPetFormModal({ customerId, tenantId, pet, onClose }: Props) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: pet?.name ?? "",
    species: pet?.species ?? "dog",
    breed: pet?.breed ?? "",
    size: pet?.size ?? "medium",
    sex: pet?.sex ?? "unknown",
    date_of_birth: pet?.date_of_birth ?? "",
    microchip_number: pet?.microchip_number ?? "",
    medical_notes: pet?.medical_notes ?? "",
    behaviour_notes: pet?.behaviour_notes ?? "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: any = {
        name: form.name.trim(),
        species: form.species,
        breed: form.breed.trim() || null,
        size: form.size,
        sex: form.sex,
        date_of_birth: form.date_of_birth || null,
        microchip_number: form.microchip_number.trim() || null,
        medical_notes: form.medical_notes.trim() || null,
        behaviour_notes: form.behaviour_notes.trim() || null,
      };
      if (pet?.id) {
        const { error } = await supabase.from("pets").update(payload).eq("id", pet.id);
        if (error) throw error;
      } else {
        const { data: petNum, error: numErr } = await supabase.rpc("next_pet_number", { target_tenant_id: tenantId });
        if (numErr) throw numErr;
        const { error } = await supabase.from("pets").insert({
          ...payload,
          tenant_id: tenantId,
          customer_id: customerId,
          pet_number: petNum as string,
          status: "active",
        } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(pet ? "Pet updated" : "Pet added");
      qc.invalidateQueries({ queryKey: ["portal_pets"] });
      qc.invalidateQueries({ queryKey: ["portal_pet"] });
      qc.invalidateQueries({ queryKey: ["portal_dash_pets"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-semibold">{pet ? "Edit pet" : "Add a pet"}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-3 text-sm">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Name</div>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Species</div>
              <select value={form.species} onChange={(e) => setForm({ ...form, species: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm">
                {SPECIES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Size</div>
              <select value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm">
                {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
          </div>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Breed</div>
            <input value={form.breed} onChange={(e) => setForm({ ...form, breed: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Sex</div>
              <select value={form.sex} onChange={(e) => setForm({ ...form, sex: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-2 text-sm">
                {SEXES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </label>
            <label className="block">
              <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Date of birth</div>
              <input type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
            </label>
          </div>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Microchip</div>
            <input value={form.microchip_number} onChange={(e) => setForm({ ...form, microchip_number: e.target.value })} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Medical notes</div>
            <textarea rows={2} value={form.medical_notes} onChange={(e) => setForm({ ...form, medical_notes: e.target.value })} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">Behaviour notes</div>
            <textarea rows={2} value={form.behaviour_notes} onChange={(e) => setForm({ ...form, behaviour_notes: e.target.value })} className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm" />
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm">Cancel</button>
          <button onClick={() => save.mutate()} disabled={save.isPending || !form.name.trim()} className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
            {save.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}