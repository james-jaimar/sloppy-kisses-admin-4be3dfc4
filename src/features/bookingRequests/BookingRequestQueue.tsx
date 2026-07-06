import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  useBookingRequests,
  useBookingRequestStatusCounts,
  useUpdateBookingRequest,
  type BookingRequestListRow,
  type BookingRequestStatus,
} from "./queries";
import { BookingRequestFormModal } from "./BookingRequestFormModal";
import {
  Check,
  X,
  MessageCircle,
  ArrowRight,
  PawPrint,
  User,
  Calendar,
  Plus,
  Search,
  Loader2,
  AlertTriangle,
} from "lucide-react";

const FILTERS: { key: BookingRequestStatus | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending_review", label: "Pending Review" },
  { key: "needs_info", label: "Needs Info" },
  { key: "approved", label: "Approved" },
  { key: "declined", label: "Declined" },
  { key: "converted", label: "Converted" },
];

const SERVICE_LABELS: Record<string, string> = {
  daycare: "Daycare",
  daycare_assessment: "Daycare assessment",
  hotel_dog: "Hotel — dog",
  hotel_cat: "Hotel — cat",
  grooming_inhouse: "Grooming (in-house)",
  grooming_mobile: "Grooming (mobile)",
  pickup_dropoff: "Pickup / drop-off",
};

const SOURCE_LABELS: Record<string, string> = {
  website_form: "Website form",
  customer_portal: "Customer portal",
  staff_capture: "Staff capture",
  email: "Email",
  phone: "Phone",
  whatsapp: "WhatsApp",
};

function formatDateTime(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

export default function BookingRequestQueue() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;

  const [activeFilter, setActiveFilter] = useState<BookingRequestStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [adminNotesDraft, setAdminNotesDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const listQ = useBookingRequests({
    tenantId,
    status: activeFilter,
    search: debouncedSearch,
  });
  const countsQ = useBookingRequestStatusCounts(tenantId);
  const update = useUpdateBookingRequest(tenantId);

  const rows = listQ.data?.rows ?? [];
  const selected: BookingRequestListRow | null = useMemo(() => {
    if (!rows.length) return null;
    return rows.find((r) => r.id === selectedId) ?? rows[0];
  }, [rows, selectedId]);

  useEffect(() => {
    if (selected && selected.id !== selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  const counts = countsQ.data;
  const summary = [
    { label: "Pending review", value: counts?.pending_review ?? 0, tone: "text-sk-orange" },
    { label: "Needs info", value: counts?.needs_info ?? 0, tone: "text-sk-orange" },
    { label: "Approved", value: counts?.approved ?? 0, tone: "text-sk-green" },
    { label: "Declined", value: counts?.declined ?? 0, tone: "text-sk-coral-dark" },
  ];

  async function changeStatus(id: string, status: BookingRequestStatus, msg: string) {
    try {
      const patch: any = { status };
      const draft = adminNotesDraft[id];
      if (draft !== undefined) patch.admin_notes = draft;
      await update.mutateAsync({ id, patch });
      toast.success(msg);
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to update request");
    }
  }

  return (
    <>
      <AppHeader
        title="Booking requests"
        subtitle="Review, approve or convert incoming requests"
        tabs={FILTERS.map((f) => ({
          label: f.label,
          active: f.key === activeFilter,
          onClick: () => setActiveFilter(f.key),
          badge:
            f.key !== "all" && counts ? counts[f.key as BookingRequestStatus] : undefined,
        }))}
        actions={
          <button
            onClick={() => setShowCreate(true)}
            disabled={!tenantId}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            <Plus className="h-4 w-4" /> New request
          </button>
        }
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {summary.map((s) => (
            <div key={s.label} className="sk-card p-5">
              <div className={"text-3xl font-semibold " + s.tone}>{s.value}</div>
              <div className="mt-1 sk-stat-label">{s.label}</div>
            </div>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.1fr_1fr]">
          {/* List */}
          <div className="sk-card overflow-hidden">
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Incoming requests</h2>
              <span className="text-xs text-muted-foreground">
                {listQ.isLoading ? "…" : `${listQ.data?.total ?? 0} total`}
              </span>
            </div>
            <div className="border-b border-border px-5 py-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search customer, pet, service..."
                  className="h-10 w-full rounded-lg border border-border bg-sk-surface-muted pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
                />
              </div>
            </div>
            {listQ.isLoading ? (
              <div className="flex items-center justify-center gap-2 px-5 py-16 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading requests…
              </div>
            ) : listQ.isError ? (
              <div className="px-5 py-16 text-center text-sm text-sk-coral-dark">
                Failed to load requests: {(listQ.error as any)?.message ?? "Unknown error"}
              </div>
            ) : rows.length === 0 ? (
              <div className="px-5 py-16 text-center text-sm text-muted-foreground">
                No booking requests found.
              </div>
            ) : (
              <ul className="divide-y divide-border">
                {rows.map((r) => {
                  const active = r.id === (selected?.id ?? "");
                  return (
                    <li
                      key={r.id}
                      onClick={() => setSelectedId(r.id)}
                      className={
                        "cursor-pointer px-5 py-4 transition-colors " +
                        (active ? "bg-sk-coral-soft/60" : "hover:bg-sk-surface-muted/60")
                      }
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 text-sm font-semibold">
                            {r.customer?.full_name ?? (
                              <span className="text-muted-foreground italic">
                                Unlinked customer
                              </span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground truncate">
                            {r.pet?.name ?? "No pet linked"}
                            {r.pet?.breed ? ` · ${r.pet.breed}` : ""}
                          </div>
                          <div className="mt-1 text-xs">
                            <span className="font-medium">
                              {SERVICE_LABELS[r.service_type] ?? r.service_type}
                            </span>
                            <span className="text-muted-foreground">
                              {" "}· {SOURCE_LABELS[r.source] ?? r.source}
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1.5">
                          <StatusBadge status={r.status} />
                          <span className="text-[11px] text-muted-foreground">
                            {formatDateTime(r.created_at)}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Detail */}
          <div className="sk-card flex flex-col">
            {!selected ? (
              <div className="grid flex-1 place-items-center px-5 py-16 text-sm text-muted-foreground">
                Select a request to review it.
              </div>
            ) : (
              <>
                <div className="border-b border-border px-5 py-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold">
                        {SERVICE_LABELS[selected.service_type] ?? selected.service_type}
                      </h2>
                      <p className="text-xs text-muted-foreground">
                        {SOURCE_LABELS[selected.source] ?? selected.source} · Created{" "}
                        {formatDateTime(selected.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={selected.status} />
                  </div>
                </div>
                <div className="flex-1 space-y-5 overflow-y-auto p-5">
                  {(!selected.customer_id || !selected.pet_id) && (
                    <div className="flex items-start gap-2 rounded-xl border border-sk-orange/40 bg-sk-orange-soft/50 p-3 text-xs text-sk-orange">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <div>
                        {!selected.customer_id && "This request has no linked customer. "}
                        {!selected.pet_id && "No pet is linked yet. "}
                        You can link one manually after the customer/pet has been created.
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <User className="h-3.5 w-3.5" /> Customer
                    </div>
                    <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm">
                      {selected.customer ? (
                        <>
                          <Link
                            to={`/admin/customers/${selected.customer.id}`}
                            className="font-medium text-sk-coral-dark hover:underline"
                          >
                            {selected.customer.full_name ?? "Unnamed"}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {selected.customer.customer_number} ·{" "}
                            {selected.customer.email ?? "no email"} ·{" "}
                            {selected.customer.mobile ?? "no mobile"}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">No customer linked</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <PawPrint className="h-3.5 w-3.5" /> Pet
                    </div>
                    <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm">
                      {selected.pet ? (
                        <>
                          <Link
                            to={`/admin/pets/${selected.pet.id}`}
                            className="font-medium text-sk-coral-dark hover:underline"
                          >
                            {selected.pet.name}
                          </Link>
                          <div className="text-xs text-muted-foreground">
                            {selected.pet.pet_number} · {selected.pet.species ?? "—"} ·{" "}
                            {selected.pet.breed ?? "—"} · {selected.pet.size ?? "—"}
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground italic">No pet linked</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      <Calendar className="h-3.5 w-3.5" /> Preferred date / time
                    </div>
                    <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm">
                      {selected.preferred_start_at
                        ? `${formatDateTime(selected.preferred_start_at)}${
                            selected.preferred_end_at
                              ? ` → ${formatDateTime(selected.preferred_end_at)}`
                              : ""
                          }`
                        : "Not specified"}
                    </div>
                  </div>

                  {selected.customer_notes && (
                    <div>
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Customer message
                      </div>
                      <div className="rounded-xl border border-border bg-sk-surface-muted p-3 text-sm whitespace-pre-wrap">
                        {selected.customer_notes}
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Internal notes
                    </div>
                    <textarea
                      key={selected.id}
                      rows={3}
                      defaultValue={selected.admin_notes ?? ""}
                      onChange={(e) =>
                        setAdminNotesDraft((d) => ({ ...d, [selected.id]: e.target.value }))
                      }
                      placeholder="Notes only visible to staff..."
                      className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
                    />
                    <div className="mt-1 text-[11px] text-muted-foreground">
                      Notes are saved with the next status change.
                    </div>
                  </div>

                  <div className="text-[11px] text-muted-foreground">
                    Last updated {formatDateTime(selected.updated_at)}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2 border-t border-border p-4 sm:grid-cols-4">
                  <button
                    disabled={update.isPending}
                    onClick={() => changeStatus(selected.id, "declined", "Request declined")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                  >
                    <X className="h-4 w-4" /> Decline
                  </button>
                  <button
                    disabled={update.isPending}
                    onClick={() => changeStatus(selected.id, "needs_info", "Marked as needs info")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
                  >
                    <MessageCircle className="h-4 w-4" /> Needs info
                  </button>
                  <button
                    disabled={update.isPending}
                    onClick={() => changeStatus(selected.id, "approved", "Request approved")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sk-turquoise px-3 py-2 text-sm font-semibold text-white hover:bg-sk-turquoise-dark disabled:opacity-60"
                  >
                    <Check className="h-4 w-4" /> Approve
                  </button>
                  <button
                    disabled={update.isPending}
                    onClick={async () => {
                      await changeStatus(selected.id, "converted", "Marked as converted");
                      toast("Booking conversion will be wired in the next step.");
                    }}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
                  >
                    Convert <ArrowRight className="h-4 w-4" />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {showCreate && tenantId && (
        <BookingRequestFormModal
          tenantId={tenantId}
          onClose={() => setShowCreate(false)}
          onCreated={(id) => {
            setSelectedId(id);
            setActiveFilter("pending_review");
          }}
        />
      )}
    </>
  );
}