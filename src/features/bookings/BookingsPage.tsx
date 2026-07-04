import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { NewBookingModal } from "./NewBookingModal";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoTodayGrooming } from "@/constants/demoData";
import { Plus } from "lucide-react";

export default function BookingsPage() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <AppHeader
        title="Bookings"
        subtitle="All confirmed bookings across services"
        actions={
          <button onClick={() => setOpen(true)} className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <Plus className="h-4 w-4" /> New booking
          </button>
        }
      />
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Time</th>
                <th className="px-5 py-3">Pet</th>
                <th className="px-5 py-3">Owner</th>
                <th className="px-5 py-3">Service</th>
                <th className="px-5 py-3">Staff</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {demoTodayGrooming.map((b) => (
                <tr key={b.id} className="hover:bg-sk-surface-muted/40">
                  <td className="px-5 py-3 tabular-nums font-medium">{b.time}</td>
                  <td className="px-5 py-3">{b.pet}</td>
                  <td className="px-5 py-3 text-muted-foreground">{b.owner}</td>
                  <td className="px-5 py-3">{b.service}</td>
                  <td className="px-5 py-3">{b.groomer}</td>
                  <td className="px-5 py-3"><StatusBadge status={b.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <NewBookingModal onClose={() => setOpen(false)} />}
    </>
  );
}