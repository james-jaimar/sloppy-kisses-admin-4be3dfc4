import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { CustomerProfileModal } from "./CustomerProfileModal";
import { useCustomers } from "./queries";
import { Plus, Search, AlertCircle, Users } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function CustomersPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { data: customers, isLoading, isError, error } = useCustomers(search);
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
        <div className="relative max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, email, phone or #"
            className="h-10 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
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
                return (
                  <tr key={c.id} className="hover:bg-sk-surface-muted/40">
                    <td className="px-5 py-3">
                      <div className="font-medium">{name}</div>
                      <div className="text-xs text-muted-foreground">{c.customer_number ?? "—"}</div>
                    </td>
                    <td className="px-5 py-3">
                      <div>{c.email ?? <span className="text-muted-foreground">—</span>}</div>
                      <div className="text-xs text-muted-foreground">{c.mobile ?? ""}</div>
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
                      <button onClick={() => setSelectedId(c.id)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted">
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
      </div>
      {selectedId && (
        <CustomerProfileModal customerId={selectedId} onClose={() => setSelectedId(null)} />
      )}
    </>
  );
}