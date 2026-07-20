import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCustomer, useCustomerPets, useCustomerEmailDuplicates, useDeleteCustomer } from "./queries";
import { CustomerFormModal } from "./CustomerFormModal";
import { PetFormModal } from "@/features/pets/PetFormModal";
import { format } from "date-fns";
import {
  AlertCircle,
  ArrowLeft,
  ExternalLink,
  FileText,
  Mail,
  MapPin,
  Phone,
  Plus,
  Pencil,
  Users,
  AlertTriangle,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import type { PetRow } from "./queries";
import { CustomerCreditPanel } from "@/features/customerCredit/CustomerCreditPanel";
import PortalAccessPanel from "./PortalAccessPanel";

const TABS = ["Pets", "Bookings", "Invoices", "Credit", "Notes", "Documents", "History"] as const;
type Tab = (typeof TABS)[number];

function initialsOf(name: string | null | undefined) {
  if (!name) return "?";
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

export default function CustomerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useCurrentTenant();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("Pets");
  const [editing, setEditing] = useState(false);
  const [addingPet, setAddingPet] = useState(false);
  const [editingPet, setEditingPet] = useState<PetRow | null>(null);

  const { data: customer, isLoading, isError, error } = useCustomer(id, tenant?.id);
  const { data: emailDupes } = useCustomerEmailDuplicates(id);
  const del = useDeleteCustomer(tenant?.id);
  const {
    data: pets,
    isLoading: petsLoading,
    isError: petsError,
    error: petsErr,
  } = useCustomerPets(id, tenant?.id);

  const name =
    customer?.full_name ||
    [customer?.first_name, customer?.last_name].filter(Boolean).join(" ") ||
    "Unnamed customer";
  const since = customer?.created_at ? format(new Date(customer.created_at), "MMM yyyy") : null;
  const address = [
    customer?.address_line_1,
    customer?.address_line_2,
    customer?.suburb,
    customer?.city,
    customer?.province,
    customer?.postcode,
  ]
    .filter(Boolean)
    .join(", ");
  const active = customer?.status === "active";
  const notes = customer?.notes_internal || null;

  return (
    <>
      <AppHeader title="Customer profile" subtitle={customer?.customer_number ? `#${customer.customer_number}` : undefined} />
      <div className="flex-1 space-y-4 p-6">
        <div>
          <Link
            to="/admin/customers"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All customers
          </Link>
        </div>

        {isLoading && (
          <div className="sk-card p-6 space-y-3">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-80" />
          </div>
        )}

        {!isLoading && isError && (
          <div className="sk-card flex items-center gap-3 p-6 text-sm text-sk-coral-dark">
            <AlertCircle className="h-4 w-4" />
            Couldn't load customer. {(error as Error)?.message}
          </div>
        )}

        {!isLoading && !isError && !customer && (
          <div className="sk-card p-10 text-center text-sm text-muted-foreground">
            Customer not found in this tenant.
          </div>
        )}

        {customer && (
          <>
            {emailDupes && emailDupes.length > 0 && (
              <div className="sk-card flex items-start gap-3 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-none" />
                <div>
                  This email <span className="font-medium">{customer.email}</span> is shared with{" "}
                  {emailDupes.length} other customer{emailDupes.length === 1 ? "" : "s"}:{" "}
                  {emailDupes.map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ", "}
                      <Link to={`/admin/customers/${d.id}`} className="font-medium underline">
                        {d.full_name ?? "customer"}
                        {d.customer_number ? ` (${d.customer_number})` : ""}
                      </Link>
                    </span>
                  ))}
                  . Consider merging or archiving duplicates.
                </div>
              </div>
            )}
            {/* Header card */}
            <div className="sk-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-full bg-sk-coral-soft text-sk-coral-dark text-lg font-semibold">
                    {initialsOf(name)}
                  </div>
                  <div>
                    <div className="text-xl font-semibold leading-tight">{name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {customer.customer_number ? `Customer #${customer.customer_number}` : "Customer"}
                      {since ? ` · Since ${since}` : ""}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusBadge
                        status={active ? "confirmed" : "requested"}
                        label={active ? "Active" : customer.status ?? "—"}
                        tone={active ? "green" : "orange"}
                      />
                      {customer.portal_access_enabled && (
                        <StatusBadge status="ready" label="Portal access" tone="turquoise" />
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditing(true)}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit customer
                  </button>
                  <Link
                    to={`/admin/customers/${customer.id}/statement`}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
                  >
                    <FileText className="h-3.5 w-3.5" /> Statement
                  </Link>
                  <button className="h-9 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark">
                    New booking
                  </button>
                  <button
                    onClick={async () => {
                      if (!window.confirm(`Delete customer ${name}? This removes their pets, draft invoices, and cannot be undone. Blocked if they have finalised invoices.`)) return;
                      try {
                        await del.mutateAsync(customer.id);
                        toast.success("Customer deleted");
                        navigate("/admin/customers");
                      } catch (err: any) {
                        toast.error(err?.message ?? "Failed to delete");
                      }
                    }}
                    disabled={del.isPending}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </div>
              </div>

              {/* Contact strip */}
              <div className="mt-5 grid gap-3 border-t border-border pt-4 md:grid-cols-3">
                <div className="flex items-start gap-2 text-sm">
                  <Mail className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div>{customer.email ?? <span className="text-muted-foreground">—</span>}</div>
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <Phone className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>
                    <div>{customer.mobile ?? <span className="text-muted-foreground">—</span>}</div>
                    {customer.phone_alt && (
                      <div className="text-xs text-muted-foreground">Alt: {customer.phone_alt}</div>
                    )}
                  </div>
                </div>
                <div className="flex items-start gap-2 text-sm">
                  <MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />
                  <div>{address || <span className="text-muted-foreground">—</span>}</div>
                </div>
              </div>

              {(customer.xero_customer_id || notes) && (
                <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
                  {customer.xero_customer_id && (
                    <div className="text-xs">
                      <div className="uppercase tracking-wide text-muted-foreground">Xero</div>
                      <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-foreground">
                        <ExternalLink className="h-3 w-3" />
                        {customer.xero_customer_id}
                      </div>
                    </div>
                  )}
                  {notes && (
                    <div className="text-xs">
                      <div className="uppercase tracking-wide text-muted-foreground">Notes</div>
                      <div className="mt-0.5 whitespace-pre-wrap text-foreground">{notes}</div>
                    </div>
                  )}
                </div>
              )}
            </div>

            <PortalAccessPanel customer={customer} />

            {/* Tabs */}
            <div className="sk-card overflow-hidden">
              <div className="flex gap-1 border-b border-border px-4">
                {TABS.map((t) => (
                  <button
                    key={t}
                    onClick={() => setTab(t)}
                    className={
                      "border-b-2 px-3 py-2.5 text-sm font-medium transition-colors " +
                      (t === tab
                        ? "border-sk-coral text-sk-coral-dark"
                        : "border-transparent text-muted-foreground hover:text-foreground")
                    }
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="p-6">
                {tab === "Pets" && (
                  <>
                    <div className="mb-3 flex items-center justify-between">
                      <h3 className="text-sm font-semibold">Linked pets</h3>
                      <button
                        onClick={() => setAddingPet(true)}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
                      >
                        <Plus className="h-3.5 w-3.5" /> Add pet
                      </button>
                    </div>
                    {petsLoading && (
                      <div className="grid gap-3 sm:grid-cols-2">
                        {Array.from({ length: 2 }).map((_, i) => (
                          <Skeleton key={i} className="h-20 w-full" />
                        ))}
                      </div>
                    )}
                    {petsError && (
                      <div className="flex items-center gap-2 text-sm text-sk-coral-dark">
                        <AlertCircle className="h-4 w-4" /> {(petsErr as Error)?.message}
                      </div>
                    )}
                    {!petsLoading && !petsError && (pets?.length ?? 0) === 0 && (
                      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-border p-8 text-center">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-surface-muted text-muted-foreground">
                          <Users className="h-4 w-4" />
                        </div>
                        <div className="text-sm font-medium">No pets linked</div>
                        <div className="text-xs text-muted-foreground">
                          Add a pet to this customer to get started.
                        </div>
                      </div>
                    )}
                    <div className="grid gap-3 sm:grid-cols-2">
                      {pets?.map((p) => {
                        const petActive = p.status === "active";
                        return (
                          <div
                            key={p.id}
                            className="flex items-center gap-3 rounded-xl border border-border bg-white p-3"
                          >
                            <div className="grid h-12 w-12 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark font-semibold">
                              {p.name?.[0]?.toUpperCase() ?? "?"}
                            </div>
                            <Link
                              to={`/admin/pets/${p.id}`}
                              className="min-w-0 flex-1 hover:underline"
                            >
                              <div className="truncate text-sm font-semibold">{p.name}</div>
                              <div className="truncate text-xs text-muted-foreground">
                                {[p.breed, p.species, p.size, p.sex].filter(Boolean).join(" · ")}
                              </div>
                              {p.pet_number && (
                                <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                  #{p.pet_number}
                                </div>
                              )}
                            </Link>
                            <div className="flex flex-col items-end gap-1.5">
                              <StatusBadge
                                status={petActive ? "confirmed" : "requested"}
                                label={p.status ?? "—"}
                                tone={petActive ? "green" : "orange"}
                              />
                              <button
                                onClick={() => setEditingPet(p)}
                                className="text-[11px] font-medium text-muted-foreground hover:text-foreground"
                              >
                                Edit
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}

                {tab === "Credit" && tenant?.id && (
                  <CustomerCreditPanel tenantId={tenant.id} customerId={customer.id} />
                )}

                {tab !== "Pets" && tab !== "Credit" && (
                  <div className="flex flex-col items-center gap-2 py-10 text-center text-sm text-muted-foreground">
                    <div className="font-medium text-foreground">{tab}</div>
                    <div className="max-w-sm text-xs">
                      Coming soon — this section will be wired up in a later step.
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {editing && customer && tenant?.id && (
        <CustomerFormModal
          tenantId={tenant.id}
          customer={customer}
          onClose={() => setEditing(false)}
        />
      )}
      {addingPet && customer && tenant?.id && (
        <PetFormModal
          tenantId={tenant.id}
          customerId={customer.id}
          onClose={() => setAddingPet(false)}
        />
      )}
      {editingPet && customer && tenant?.id && (
        <PetFormModal
          tenantId={tenant.id}
          customerId={customer.id}
          pet={editingPet}
          onClose={() => setEditingPet(null)}
        />
      )}
    </>
  );
}