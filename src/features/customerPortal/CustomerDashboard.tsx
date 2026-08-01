import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "./hooks";
import { SERVICE_LABEL, fmtDateTime, statusTone } from "./portalCommon";
import { PawPrint, CalendarPlus, ReceiptText, Upload, Loader2, Inbox, Scissors } from "lucide-react";
import { fmtZar, effectiveInvoiceStatus, InvoiceStatusChip } from "@/features/invoices/status";
import { useConsentStatus } from "@/features/consent/consentQueries";
import { ClipboardCheck, ArrowRight } from "lucide-react";

export default function CustomerDashboard() {
  const cust = useCurrentCustomer();
  const customerId = cust.data?.id ?? null;
  const tenantId = cust.data?.tenant_id ?? null;
  const consent = useConsentStatus();

  const upcoming = useQuery({
    queryKey: ["portal_dash_upcoming", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, booking_number, service_type, status, start_at, booking_pets(pet:pets(name))")
        .eq("customer_id", customerId!)
        .gte("start_at", new Date().toISOString())
        .order("start_at", { ascending: true })
        .limit(5);
      if (error) throw error;
      return data ?? [];
    },
  });

  const invoices = useQuery({
    queryKey: ["portal_dash_invoices", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("invoices")
        .select("id, invoice_number, balance_due, total, amount_paid, status, due_date, issue_date")
        .eq("customer_id", customerId!)
        .order("issue_date", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  const pets = useQuery({
    queryKey: ["portal_dash_pets", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("pets")
        .select("id, name, species, breed")
        .eq("customer_id", customerId!)
        .eq("status", "active")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });

  const pendingRequests = useQuery({
    queryKey: ["portal_dash_requests", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("booking_requests")
        .select("id, status")
        .eq("customer_id", customerId!)
        .in("status", ["pending_review", "needs_info"]);
      if (error) throw error;
      return data ?? [];
    },
  });

  // Detect dogs that don't yet have saved grooming preferences.
  const groomingGap = useQuery({
    queryKey: ["portal_dash_grooming_gap", customerId],
    enabled: !!customerId,
    queryFn: async () => {
      const { data: dogs, error: dogsErr } = await supabase
        .from("pets")
        .select("id, name")
        .eq("customer_id", customerId!)
        .eq("species", "dog")
        .eq("status", "active");
      if (dogsErr) throw dogsErr;
      const ids = (dogs ?? []).map((d: any) => d.id);
      if (ids.length === 0) return { missing: [] as { id: string; name: string }[] };
      const { data: defs, error: defsErr } = await supabase
        .from("pet_grooming_defaults" as any)
        .select("pet_id")
        .in("pet_id", ids);
      if (defsErr) throw defsErr;
      const have = new Set((defs ?? []).map((d: any) => d.pet_id));
      return { missing: (dogs ?? []).filter((d: any) => !have.has(d.id)) };
    },
  });

  if (cust.isLoading) {
    return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!cust.data) {
    return (
      <>
        <AppHeader title="Welcome" />
        <div className="p-6 text-sm text-muted-foreground">No customer profile linked to your account yet. Contact Sloppy Kisses to enable portal access.</div>
      </>
    );
  }

  const first = cust.data.first_name ?? cust.data.full_name?.split(" ")[0] ?? "there";
  const balance = (invoices.data ?? []).reduce((s, i: any) => s + Number(i.balance_due ?? 0), 0);
  const outstandingCount = (invoices.data ?? []).filter((i: any) => Number(i.balance_due ?? 0) > 0).length;
  const outstandingInvoices = (invoices.data ?? []).filter((i: any) => Number(i.balance_due ?? 0) > 0).slice(0, 3);
  const pendingCount = pendingRequests.data?.length ?? 0;

  return (
    <>
      <AppHeader title={`Welcome back, ${first} 👋`} subtitle={cust.data.email ?? ""} />
      <div className="flex-1 space-y-6 p-6">
        {consent.data?.needsWizard && (
          <Link
            to="/customer/registration"
            className={`sk-card flex flex-col gap-3 border-l-4 p-5 transition-colors sm:flex-row sm:items-center ${
              consent.data.mode === "hard"
                ? "border-l-sk-coral bg-sk-coral-soft/30 hover:bg-sk-coral-soft/50"
                : "border-l-sk-turquoise bg-sk-turquoise-soft/40 hover:bg-sk-turquoise-soft/60"
            }`}
          >
            <span className={`grid h-11 w-11 place-items-center rounded-xl ${consent.data.mode === "hard" ? "bg-sk-coral text-white" : "bg-sk-turquoise-dark text-white"}`}>
              <ClipboardCheck className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">
                {consent.data.mode === "hard"
                  ? "Please complete your digital registration"
                  : "Finish your digital registration"}
              </div>
              <div className="text-xs text-muted-foreground">
                {consent.data.mode === "hard"
                  ? "This is required to keep booking with us."
                  : `Takes about 3–4 minutes. ${consent.data.daysRemaining} day${consent.data.daysRemaining === 1 ? "" : "s"} left in your grace period.`}
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-sk-coral-dark">
              Start now <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        )}

        {(groomingGap.data?.missing.length ?? 0) > 0 && (
          <Link
            to={`/customer/pets/${groomingGap.data!.missing[0].id}#grooming`}
            className="sk-card flex flex-col gap-3 border-l-4 border-l-sk-turquoise bg-sk-turquoise-soft/30 p-5 transition-colors hover:bg-sk-turquoise-soft/50 sm:flex-row sm:items-center"
          >
            <span className="grid h-11 w-11 place-items-center rounded-xl bg-sk-turquoise-dark text-white">
              <Scissors className="h-5 w-5" />
            </span>
            <div className="flex-1">
              <div className="text-sm font-semibold">Set grooming preferences for {groomingGap.data!.missing.map(p => p.name).join(", ")}</div>
              <div className="text-xs text-muted-foreground">
                Save your pup's usual coat, ear & nail preferences once — we'll pre-fill every grooming booking after that.
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-sk-turquoise-dark">
              Set now <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        )}

        <div className="grid gap-4 md:grid-cols-4">
          <div className="sk-card p-5">
            <div className="sk-stat-label">Upcoming bookings</div>
            <div className="mt-2 sk-stat-value">{upcoming.data?.length ?? 0}</div>
          </div>
          <div className="sk-card p-5">
            <div className="sk-stat-label">Outstanding balance</div>
            <div className="mt-2 text-3xl font-semibold text-sk-coral-dark">R {balance.toLocaleString("en-ZA", { minimumFractionDigits: 2 })}</div>
            <Link to="/customer/invoices" className="mt-1 inline-block text-xs font-medium text-sk-coral-dark hover:underline">
              {outstandingCount} unpaid invoice{outstandingCount === 1 ? "" : "s"}
            </Link>
          </div>
          <div className="sk-card p-5">
            <div className="sk-stat-label">Pending requests</div>
            <div className="mt-2 sk-stat-value">{pendingCount}</div>
            <Link to="/customer/requests" className="mt-1 inline-block text-xs font-medium text-sk-turquoise-dark hover:underline">View requests</Link>
          </div>
          <div className="sk-card p-5">
            <div className="sk-stat-label">My pets</div>
            <div className="mt-2 sk-stat-value">{pets.data?.length ?? 0}</div>
            <Link to="/customer/pets" className="mt-1 inline-block text-xs font-medium text-sk-turquoise-dark hover:underline">Manage pets</Link>
          </div>
        </div>

        {outstandingInvoices.length > 0 && (
          <div className="sk-card">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Outstanding invoices</h2>
              <Link to="/customer/invoices" className="text-sm font-medium text-sk-coral-dark hover:underline">View all</Link>
            </div>
            <ul className="divide-y divide-border">
              {outstandingInvoices.map((i: any) => (
                <li key={i.id}>
                  <Link to={`/customer/invoices/${i.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-sk-surface-muted">
                    <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-orange-soft text-sk-orange"><ReceiptText className="h-4 w-4" /></div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-semibold">{i.invoice_number}</div>
                      <div className="text-xs text-muted-foreground">Due {i.due_date ?? "—"}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold text-sk-coral-dark">{fmtZar(i.balance_due)}</div>
                      <InvoiceStatusChip status={effectiveInvoiceStatus(i)} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="sk-card lg:col-span-2">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Upcoming bookings</h2>
              <Link to="/customer/bookings" className="text-sm font-medium text-sk-coral-dark hover:underline">View all</Link>
            </div>
            {upcoming.isLoading && <div className="p-5 text-sm text-muted-foreground">Loading…</div>}
            {upcoming.data && upcoming.data.length === 0 && <div className="p-5 text-sm text-muted-foreground">No upcoming bookings.</div>}
            <ul className="divide-y divide-border">
              {(upcoming.data ?? []).map((u: any) => {
                const petNames = (u.booking_pets ?? []).map((bp: any) => bp.pet?.name).filter(Boolean).join(", ");
                return (
                  <li key={u.id}>
                    <Link to={`/customer/bookings/${u.id}`} className="flex items-center gap-4 px-5 py-4 hover:bg-sk-surface-muted">
                      <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark font-semibold">
                        {petNames.charAt(0) || "?"}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold">{SERVICE_LABEL[u.service_type] ?? u.service_type} · {petNames || "—"}</div>
                        <div className="text-xs text-muted-foreground">{fmtDateTime(u.start_at)} · {u.booking_number}</div>
                      </div>
                      <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + statusTone(u.status)}>{u.status}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          <div className="sk-card">
            <div className="border-b border-border px-5 py-4">
              <h2 className="text-base font-semibold">Quick actions</h2>
            </div>
            <div className="grid grid-cols-2 gap-2 p-4">
              <Link to="/customer/bookings/new" className="flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-left hover:bg-sk-surface-muted">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sk-green-soft text-sk-green"><CalendarPlus className="h-4 w-4" /></span>
                <span className="text-sm font-medium">Request booking</span>
              </Link>
              <Link to="/customer/pets" className="flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-left hover:bg-sk-surface-muted">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sk-coral-soft text-sk-coral-dark"><PawPrint className="h-4 w-4" /></span>
                <span className="text-sm font-medium">Add pet</span>
              </Link>
              <Link to="/customer/documents" className="flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-left hover:bg-sk-surface-muted">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sk-turquoise-soft text-sk-turquoise-dark"><Upload className="h-4 w-4" /></span>
                <span className="text-sm font-medium">Upload vaccine</span>
              </Link>
              <Link to="/customer/invoices" className="flex flex-col items-start gap-2 rounded-xl border border-border p-3 text-left hover:bg-sk-surface-muted">
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sk-orange-soft text-sk-orange"><ReceiptText className="h-4 w-4" /></span>
                <span className="text-sm font-medium">View invoices</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}