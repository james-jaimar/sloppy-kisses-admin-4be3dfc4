import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { PawPrint, Plus, Loader2, Scissors } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import { MyPetFormModal } from "./MyPetFormModal";

export default function MyPetsPage() {
  const cust = useCurrentCustomer();
  const [addOpen, setAddOpen] = useState(false);
  const customerId = cust.data?.id ?? null;

  const pets = useQuery({
    queryKey: ["portal_pets", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, breed, size, date_of_birth, photo_url, status")
        .eq("customer_id", customerId!)
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <>
      <AppHeader
        title="My pets"
        subtitle="Manage your pets and their records"
        actions={cust.data ? (
          <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> Add pet
          </button>
        ) : undefined}
      />
      <div className="flex-1 p-6">
        {pets.isLoading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>}
        {pets.data && pets.data.length === 0 && (
          <div className="sk-card grid place-items-center gap-3 p-10 text-center">
            <PawPrint className="h-10 w-10 text-muted-foreground" />
            <div className="text-sm text-muted-foreground">No pets on file yet.</div>
            <button onClick={() => setAddOpen(true)} className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">Add your first pet</button>
          </div>
        )}
        <div className="grid gap-3 md:grid-cols-2">
          {(pets.data ?? []).map((p: any) => (
            <div key={p.id} className="sk-card flex items-center gap-4 p-4 transition-colors hover:border-sk-coral">
              <Link to={`/customer/pets/${p.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                <div className="grid h-14 w-14 place-items-center overflow-hidden rounded-2xl bg-sk-coral-soft text-lg font-semibold text-sk-coral-dark">
                  {p.photo_url ? <img src={p.photo_url} alt="" className="h-full w-full object-cover" /> : (p.name?.[0] ?? "?")}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-base font-semibold">{p.name}</div>
                  <div className="text-xs text-muted-foreground">{[p.breed, p.species, p.size].filter(Boolean).join(" · ")}</div>
                </div>
              </Link>
              {(p.species === "dog" || p.species === "cat") && (
                <Link
                  to={`/customer/pets/${p.id}#grooming`}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:border-sk-coral hover:text-sk-coral-dark"
                >
                  <Scissors className="h-3.5 w-3.5" /> Grooming preferences
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
      {addOpen && cust.data && (
        <MyPetFormModal customerId={cust.data.id} tenantId={cust.data.tenant_id} onClose={() => setAddOpen(false)} />
      )}
    </>
  );
}