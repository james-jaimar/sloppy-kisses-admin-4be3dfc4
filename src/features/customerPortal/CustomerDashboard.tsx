import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "./hooks";
import { SERVICE_LABEL, fmtDateTime, statusTone } from "./portalCommon";
import { PawPrint, CalendarPlus, Receipt, Upload, Loader2 } from "lucide-react";

export default function CustomerDashboard() {
  const cust = useCurrentCustomer();
  const customerId = cust.data?.id ?? null;
  const tenantId = cust.data?.tenant_id ?? null;

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
        .select("balance_due, status")
        .eq("customer_id", customerId!);
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

  return (
    <>
      <AppHeader title={`Welcome back, ${first} 👋`} subtitle={cust.data.email ?? ""} />
      <div className="flex-1 space-y-6 p-6">
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
            <div className="sk-stat-label">My pets</div>
            <div className="mt-2 sk-stat-value">{pets.data?.length ?? 0}</div>
            <Link to="/customer/pets" className="mt-1 inline-block text-xs font-medium text-sk-turquoise-dark hover:underline">Manage pets</Link>
          </div>
          <div className="sk-card p-5">
            <div className="sk-stat-label">Contact</div>
            <div className="mt-2 text-sm font-semibold truncate">{cust.data.mobile ?? "—"}</div>
            <Link to="/customer/profile" className="mt-1 inline-block text-xs font-medium text-sk-turquoise-dark hover:underline">Edit profile</Link>
          </div>
        </div>

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
                <span className="grid h-9 w-9 place-items-center rounded-lg bg-sk-orange-soft text-sk-orange"><Receipt className="h-4 w-4" /></span>
                <span className="text-sm font-medium">View invoices</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}