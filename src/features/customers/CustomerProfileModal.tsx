import { ModalShell } from "@/components/modals/ModalShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Mail, Phone, MapPin, Plus, ExternalLink, AlertCircle, Loader2 } from "lucide-react";
import { useCustomer, useCustomerPets } from "./queries";
import { format } from "date-fns";

const tabs = ["Pets", "Bookings", "Invoices", "Notes", "Documents", "History"] as const;

function initialsOf(name: string | null | undefined) {
  if (!name) return "?";
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? "")
    .join("") || "?";
}

export function CustomerProfileModal({ customerId, onClose }: { customerId: string; onClose?: () => void }) {
  const { data: customer, isLoading, isError, error } = useCustomer(customerId);
  const { data: pets, isLoading: petsLoading } = useCustomerPets(customerId);

  const name =
    customer?.full_name ||
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
    "Unnamed customer";
  const since = customer?.created_at ? format(new Date(customer.created_at), "MMM yyyy") : null;
  const address = [customer?.address_line_1, customer?.suburb, customer?.city].filter(Boolean).join(", ");

  return (
    <ModalShell
      wide
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-sk-coral-soft text-sk-coral-dark font-semibold">
            {initialsOf(name)}
          </div>
          <div>
            <div className="text-lg font-semibold leading-tight">{name}</div>
            <div className="text-xs text-muted-foreground">
              {customer?.customer_number ? `Customer ${customer.customer_number}` : "Customer"}
              {since ? ` · Since ${since}` : ""}
            </div>
          </div>
        </div>
      }
      headerRight={
        <button className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
          <ExternalLink className="h-3.5 w-3.5" />
          Open full profile
        </button>
      }
      footer={
        <div className="flex items-center justify-between">
          <div className="flex gap-4 text-xs text-muted-foreground">
            <span>Portal access: <span className="font-semibold text-foreground">{customer?.portal_access_enabled ? "Enabled" : "Disabled"}</span></span>
            <span>Status: <span className="font-semibold text-foreground">{customer?.status ?? "—"}</span></span>
          </div>
          <div className="flex gap-2">
            <button className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-white">Email customer</button>
            <button className="h-9 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">New booking</button>
          </div>
        </div>
      }
    >
      {/* Summary strip */}
      <div className="grid gap-4 border-b border-border bg-sk-surface-muted px-6 py-4 md:grid-cols-3">
        <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> {customer?.email ?? <span className="text-muted-foreground">—</span>}</div>
        <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> {customer?.mobile ?? <span className="text-muted-foreground">—</span>}</div>
        <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /> {address || <span className="text-muted-foreground">—</span>}</div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border px-4">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={
              "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors " +
              (i === 0
                ? "border-sk-coral text-sk-coral-dark"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {t}
          </button>
        ))}
      </div>

      {/* Pets tab content */}
      <div className="p-6">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Linked pets</h3>
          <button className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted">
            <Plus className="h-3.5 w-3.5" /> Add pet
          </button>
        </div>
        {(isLoading || petsLoading) && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        )}
        {isError && (
          <div className="flex items-center gap-2 text-sm text-sk-coral-dark">
            <AlertCircle className="h-4 w-4" /> {(error as Error)?.message}
          </div>
        )}
        {!isLoading && !petsLoading && !isError && (pets?.length ?? 0) === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No pets linked to this customer yet.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          {pets?.map((p) => {
            const age = p.age_years != null ? `${Number(p.age_years).toFixed(0)}y` : null;
            return (
              <div key={p.id} className="flex items-center gap-3 rounded-xl border border-border bg-white p-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark font-semibold">
                  {p.name?.[0]?.toUpperCase() ?? "?"}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold truncate">{p.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {[p.breed, p.species, age].filter(Boolean).join(" · ")}
                  </div>
                  {p.pet_number && (
                    <div className="text-[10px] uppercase tracking-wide text-muted-foreground">#{p.pet_number}</div>
                  )}
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <StatusBadge
                    status={p.status === "active" ? "confirmed" : "requested"}
                    label={p.status ?? "—"}
                    tone={p.status === "active" ? "green" : "orange"}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </ModalShell>
  );
}