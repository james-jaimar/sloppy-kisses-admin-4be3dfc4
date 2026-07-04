import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { usePets } from "@/features/customers/queries";
import { AlertCircle, Dog, Plus, Search } from "lucide-react";

export default function PetsPage() {
  const [search, setSearch] = useState("");
  const { data, isLoading, isError, error } = usePets(search);
  return (
    <>
      <AppHeader
        title="Pets"
        subtitle="All pets across the Sloppy Kisses customer base"
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> Add pet
          </button>
        }
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, breed or #"
            className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>
        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Pet</th>
                <th className="px-5 py-3">Breed</th>
                <th className="px-5 py-3">Species</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-32" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-16" /></td>
                  </tr>
                ))}
              {!isLoading && !isError && data?.map((p: any) => (
                <tr key={p.id} className="hover:bg-sk-surface-muted/40">
                  <td className="px-5 py-3">
                    <div className="font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">{p.pet_number ?? "—"}</div>
                  </td>
                  <td className="px-5 py-3">{p.breed ?? <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-5 py-3 capitalize text-muted-foreground">{p.species ?? "—"}</td>
                  <td className="px-5 py-3">
                    {p.customers?.full_name ?? <span className="text-muted-foreground">—</span>}
                    {p.customers?.customer_number && (
                      <div className="text-xs text-muted-foreground">{p.customers.customer_number}</div>
                    )}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge
                      status={p.status === "active" ? "confirmed" : "requested"}
                      label={p.status ?? "—"}
                      tone={p.status === "active" ? "green" : "orange"}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isLoading && isError && (
            <div className="flex items-center gap-3 border-t border-border px-5 py-6 text-sm text-sk-coral-dark">
              <AlertCircle className="h-4 w-4" /> Couldn't load pets. {(error as Error)?.message}
            </div>
          )}
          {!isLoading && !isError && (data?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sk-surface-muted text-muted-foreground">
                <Dog className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">No pets found</div>
              <div className="max-w-sm text-xs text-muted-foreground">
                {search
                  ? "No matches. Try a different search."
                  : "Sign in as a tenant user to see the imported Sloppy Kisses pet records."}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}