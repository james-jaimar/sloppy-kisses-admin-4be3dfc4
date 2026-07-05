import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCustomers } from "./queries";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { Plus, Search, AlertCircle, Users, ChevronLeft, ChevronRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const PAGE_SIZE = 50;

export default function CustomersPage() {
  const navigate = useNavigate();
  const { tenant } = useCurrentTenant();
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const { data, isLoading, isError, error, isFetching } = useCustomers({
    tenantId: tenant?.id,
    search,
    page,
    pageSize: PAGE_SIZE,
  });
  const customers = data?.rows;
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  return (
    <>
      <AppHeader
        title="Customers"
        subtitle="Search and manage customer records"
        actions={
          <button className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> Add customer
          </button>
        }
      />
      <div className="flex-1 space-y-4 p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search name, email, phone or #"
            className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
          </div>
          <div className="text-xs text-muted-foreground tabular-nums">
            {isLoading ? "Loading…" : `${total.toLocaleString()} customers`}
            {isFetching && !isLoading ? " · refreshing…" : ""}
          </div>
        </div>
        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Pets</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-52" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-8" /></td>
                    <td className="px-5 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-5 py-3"></td>
                  </tr>
                ))}
              {!isLoading && !isError && customers?.map((c) => {
                const name = c.full_name || [c.first_name, c.last_name].filter(Boolean).join(" ") || "Unnamed";
                const active = c.status === "active";
                const location = [c.suburb, c.city].filter(Boolean).join(", ");
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/admin/customers/${c.id}`)}
                    className="cursor-pointer hover:bg-sk-surface-muted/40"
                  >
                    <td className="px-5 py-3">
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">{c.customer_number ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div>{c.email ?? <span className="text-muted-foreground">—</span>}</div>
                      <div className="text-xs text-muted-foreground">
                        {[c.mobile, location].filter(Boolean).join(" · ")}
                      </div>
                    </td>
                    <td className="px-5 py-3 tabular-nums">{c.pet_count}</td>
                    <td className="px-5 py-3">
                      <StatusBadge
                        status={active ? "confirmed" : "requested"}
                        label={active ? "Active" : (c.status ?? "—")}
                        tone={active ? "green" : "orange"}
                      />
                    </td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/admin/customers/${c.id}`);
                        }}
                        className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted"
                      >
                        View
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!isLoading && isError && (
            <div className="flex items-center gap-3 border-t border-border px-5 py-6 text-sm text-sk-coral-dark">
              <AlertCircle className="h-4 w-4" />
              Couldn't load customers. {(error as Error)?.message}
            </div>
          )}
          {!isLoading && !isError && (customers?.length ?? 0) === 0 && (
            <div className="flex flex-col items-center gap-2 px-5 py-14 text-center">
              <div className="grid h-12 w-12 place-items-center rounded-2xl bg-sk-surface-muted text-muted-foreground">
                <Users className="h-5 w-5" />
              </div>
              <div className="text-sm font-medium">No customers found</div>
              <div className="max-w-sm text-xs text-muted-foreground">
                {search
                  ? "No matches. Try a different search."
                  : "Sign in as a tenant user to see the imported Sloppy Kisses customer records."}
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