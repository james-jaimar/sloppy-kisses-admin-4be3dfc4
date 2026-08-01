import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { PetVaccinationsPanel } from "@/features/pets/PetVaccinationsPanel";
import { DocumentsPanel } from "@/features/documents/DocumentsPanel";
import { PetGroomingDefaultsPanel } from "@/features/grooming/instructions/PetGroomingDefaultsPanel";
import { SizeOverrideBadge } from "@/features/pets/SizeOverrideControl";
import { useCurrentCustomer } from "../hooks";
import { MyPetFormModal } from "./MyPetFormModal";

export default function MyPetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const cust = useCurrentCustomer();
  const [editOpen, setEditOpen] = useState(false);

  const pet = useQuery({
    queryKey: ["portal_pet", id],
    enabled: !!id && !!cust.data?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("id, tenant_id, customer_id, name, species, breed, size, size_override, size_override_reason, sex, date_of_birth, microchip_number, medical_notes, behaviour_notes, photo_url")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const loaded = Boolean(pet.data);
  useEffect(() => {
    if (!loaded || window.location.hash !== "#grooming") return;
    const el = document.getElementById("grooming");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [loaded]);

  if (pet.isLoading || cust.isLoading) {
    return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!pet.data) return <div className="p-6 text-sm text-muted-foreground">Pet not found.</div>;

  const p = pet.data;
  return (
    <>
      <AppHeader
        title={p.name ?? "Pet"}
        subtitle={[p.breed, p.species].filter(Boolean).join(" · ")}
        actions={
          <button onClick={() => setEditOpen(true)} className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted">
            <Pencil className="h-4 w-4" /> Edit
          </button>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        <Link to="/customer/pets" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to pets
        </Link>

        {(p as any).size_override && (
          <div className="rounded-lg border border-sk-orange-soft bg-sk-orange-soft/40 p-3 text-xs text-sk-orange">
            <SizeOverrideBadge pet={p as any} />
            {(p as any).size_override_reason && <div className="mt-1 opacity-80">{(p as any).size_override_reason}</div>}
          </div>
        )}

        <div className="sk-card grid gap-4 p-6 md:grid-cols-2">
          <Field label="Name" value={p.name} />
          <Field label="Species" value={p.species} />
          <Field label="Breed" value={p.breed} />
          <Field label="Size" value={p.size} />
          <Field label="Sex" value={p.sex} />
          <Field label="Date of birth" value={p.date_of_birth} />
          <Field label="Microchip" value={p.microchip_number} />
          <Field label="Medical notes" value={p.medical_notes} full />
          <Field label="Behaviour notes" value={p.behaviour_notes} full />
        </div>

        {(p.species === "dog" || p.species === "cat") && (
          <PetGroomingDefaultsPanel tenantId={p.tenant_id} petId={p.id} variant="portal" petName={p.name} />
        )}
        <PetVaccinationsPanel tenantId={p.tenant_id} petId={p.id} canManage />
        <DocumentsPanel
          tenantId={p.tenant_id}
          petId={p.id}
          uploadedVia="portal"
          title={`${p.name ?? "Pet"} — documents`}
        />
      </div>

      {editOpen && (
        <MyPetFormModal customerId={p.customer_id} tenantId={p.tenant_id} pet={p as any} onClose={() => setEditOpen(false)} />
      )}
    </>
  );
}

function Field({ label, value, full }: { label: string; value: string | null | undefined; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <div className="text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <div className="mt-1 text-sm">{value || "—"}</div>
    </div>
  );
}