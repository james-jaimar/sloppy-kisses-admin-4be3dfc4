import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useTenantPets } from "@/features/customers/queries";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { AlertCircle, ChevronLeft, ChevronRight, Dog, Search } from "lucide-react";

const PAGE_SIZE = 50;

export default function PetsPage() {
  const navigate = useNavigate();
  const { tenant } = useCurrentTenant();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, error, isFetching } = useTenantPets({
    tenantId: tenant?.id,
    search,
    page,
    pageSize: PAGE_SIZE,
  });
  const pets = data?.rows;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <AppHeader title="Pets" subtitle="All pets across the Sloppy Kisses customer base" />
      <div className="flex-1 space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search pet name, breed, # or owner"
              className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
            />
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {isLoading ? "Loading…" : `${total.toLocaleString()} pets`}
            {isFetching && !isLoading ? " · refreshing…" : ""}
          </div>
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
              {!isLoading && !isError &&
                pets?.map((p: any) => {
                  const petActive = p.status === "active";
                  return (
                    <tr
                      key={p.id}
                      onClick={() => navigate(`/admin/pets/${p.id}`)}
                      className="cursor-pointer hover:bg-sk-surface-muted/40"
                    >
                      <td className="px-5 py-3">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-muted-foreground">{p.pet_number ?? "—"}</div>
                      </td>
                      <td className="px-5 py-3">
                        {p.breed ?? <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="px-5 py-3 capitalize text-muted-foreground">
                        {p.species ?? "—"}
                      </td>
                      <td className="px-5 py-3">
                        <div>
                          {p.customers?.full_name ?? <span className="text-muted-foreground">—</span>}
                        </div>
                        {p.customers?.customer_number && (
                          <div className="text-xs text-muted-foreground">
                            {p.customers.customer_number}
                          </div>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge
                          status={petActive ? "confirmed" : "requested"}
                          label={petActive ? "Active" : p.status ?? "—"}
                          tone={petActive ? "green" : "orange"}
                        />
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
          {!isLoading && isError && (
            <div className="flex items-center gap-3 border-t border-border px-5 py-6 text-sm text-sk-coral-dark">
              <AlertCircle className="h-4 w-4" /> Couldn't load pets. {(error as Error)?.message}
            </div>
          )}
          {!isLoading && !isError && (pets?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sk-surface-muted text-muted-foreground">
                <Dog className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">No pets found</div>
              <div className="max-w-sm text-xs text-muted-foreground">
                {search
                  ? "No matches. Try a different search."
                  : "Add a pet from a customer profile to get started."}
              </div>
            </div>
          )}
        </div>
        {!isError && total > PAGE_SIZE && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="tabular-nums">
              Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of{" "}
              {total.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 font-medium hover:bg-muted disabled:opacity-40"
              >
                <ChevronLeft className="h-3.5 w-3.5" /> Prev
              </button>
              <div className="tabular-nums">
                Page {page + 1} / {totalPages}
              </div>
              <button
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                disabled={page + 1 >= totalPages}
                className="inline-flex h-8 items-center gap-1 rounded-lg border border-border px-2 font-medium hover:bg-muted disabled:opacity-40"
              >
                Next <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}