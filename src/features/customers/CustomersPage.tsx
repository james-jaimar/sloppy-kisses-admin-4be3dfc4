import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { demoCustomers } from "@/constants/demoData";
import { CustomerProfileModal } from "./CustomerProfileModal";
import { Plus } from "lucide-react";

export default function CustomersPage() {
  const [open, setOpen] = useState(false);
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
      <div className="flex-1 p-6">
        <div className="sk-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-5 py-3">Customer</th>
                <th className="px-5 py-3">Contact</th>
                <th className="px-5 py-3">Pets</th>
                <th className="px-5 py-3">Outstanding</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {demoCustomers.map((c) => (
                <tr key={c.id} className="hover:bg-sk-surface-muted/40">
                  <td className="px-5 py-3">
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground">{c.number}</div>
                  </td>
                  <td className="px-5 py-3">
                    <div>{c.email}</div>
                    <div className="text-xs text-muted-foreground">{c.phone}</div>
                  </td>
                  <td className="px-5 py-3 tabular-nums">{c.pets}</td>
                  <td className="px-5 py-3 tabular-nums">
                    {c.outstanding > 0
                      ? <span className="font-semibold text-sk-coral-dark">R {c.outstanding}</span>
                      : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={c.outstanding > 0 ? "requested" : "confirmed"} label={c.outstanding > 0 ? "Owes" : "Active"} tone={c.outstanding > 0 ? "orange" : "green"} />
                  </td>
                  <td className="px-5 py-3 text-right">
                    <button onClick={() => setOpen(true)} className="rounded-lg border border-border px-3 py-1 text-xs font-medium hover:bg-muted">
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {open && <CustomerProfileModal onClose={() => setOpen(false)} />}
    </>
  );
}