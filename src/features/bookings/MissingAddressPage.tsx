import { useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { AlertTriangle, Loader2, MapPinOff, CheckCircle2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { Button } from "@/components/ui/button";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useBookingsMissingAddress, type MissingAddressBooking } from "./addressGate";
import { FixAddressDialog } from "./AddressGate";

const SERVICE_LABEL: Record<string, string> = {
  grooming_mobile: "Mobile grooming",
  pickup_dropoff: "Pick up / drop-off",
};

export default function MissingAddressPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const q = useBookingsMissingAddress(tenantId);
  const [fixing, setFixing] = useState<MissingAddressBooking | null>(null);
  const rows = q.data ?? [];

  return (
    <>
      <AppHeader
        title="Bookings needing an address"
        subtitle="Mobile grooming and pick-up / drop-off jobs a van cannot be routed to"
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        {q.isLoading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading…
          </div>
        ) : q.isError ? (
          <div className="sk-card p-6 text-sm text-destructive">
            Could not load the list: {(q.error as any)?.message ?? "Unknown error"}
          </div>
        ) : rows.length === 0 ? (
          <div className="sk-card flex items-center gap-3 p-6 text-sm">
            <CheckCircle2 className="h-5 w-5 text-sk-green" />
            Every upcoming van job has a Google-verified address. Nothing to fix.
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 rounded-xl border-2 border-destructive bg-destructive/10 p-4 text-sm font-semibold text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" />
              {rows.length} upcoming van {rows.length === 1 ? "job has" : "jobs have"} no address a driver can
              navigate to.
            </div>

            {/* Mobile: cards. Desktop: table. */}
            <div className="space-y-3 md:hidden">
              {rows.map((r) => (
                <div key={r.id} className="sk-card space-y-2 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <Link to={`/admin/bookings/${r.id}`} className="text-sm font-semibold hover:underline">
                      {r.customer?.full_name ?? "—"}
                    </Link>
                    <span className="inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold uppercase text-destructive-foreground">
                      <MapPinOff className="h-3 w-3" />
                      {r.state === "missing" ? "No address" : "Not verified"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.start_at ? format(new Date(r.start_at), "EEE d MMM yyyy · HH:mm") : "—"} ·{" "}
                    {SERVICE_LABEL[r.service_type] ?? r.service_type}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.pets.map((p) => p.name).filter(Boolean).join(", ") || "—"} ·{" "}
                    {r.resource?.name ?? "Unassigned"}
                  </div>
                  <Button size="sm" variant="destructive" onClick={() => setFixing(r)}>
                    Fix address
                  </Button>
                </div>
              ))}
            </div>

            <div className="sk-card hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">When</th>
                    <th className="px-4 py-3">Customer</th>
                    <th className="px-4 py-3">Pet</th>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-4 py-3">Van</th>
                    <th className="px-4 py-3">Problem</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="whitespace-nowrap px-4 py-3">
                        {r.start_at ? format(new Date(r.start_at), "EEE d MMM · HH:mm") : "—"}
                      </td>
                      <td className="px-4 py-3">
                        <Link to={`/admin/bookings/${r.id}`} className="font-medium hover:underline">
                          {r.customer?.full_name ?? "—"}
                        </Link>
                        <div className="text-xs text-muted-foreground">{r.booking_number}</div>
                      </td>
                      <td className="px-4 py-3">{r.pets.map((p) => p.name).filter(Boolean).join(", ") || "—"}</td>
                      <td className="px-4 py-3">{SERVICE_LABEL[r.service_type] ?? r.service_type}</td>
                      <td className="px-4 py-3">{r.resource?.name ?? "Unassigned"}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 rounded bg-destructive px-1.5 py-0.5 text-[11px] font-bold uppercase text-destructive-foreground">
                          <MapPinOff className="h-3 w-3" />
                          {r.state === "missing" ? "No address" : "Not verified"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button size="sm" variant="destructive" onClick={() => setFixing(r)}>
                          Fix address
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {fixing && (
        <FixAddressDialog
          open
          onOpenChange={(v) => !v && setFixing(null)}
          tenantId={tenantId}
          bookingId={fixing.id}
          customerId={fixing.customer_id}
          currentAddressId={fixing.service_address_id}
        />
      )}
    </>
  );
}