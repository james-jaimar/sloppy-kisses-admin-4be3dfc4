import { ModalShell } from "@/components/modals/ModalShell";
import { StatusBadge } from "@/components/ui/status-badge";
import { Mail, Phone, MapPin, Plus, ExternalLink } from "lucide-react";

const tabs = ["Pets", "Bookings", "Invoices", "Notes", "Documents", "History"] as const;

const pets = [
  { name: "Max",   breed: "Golden Retriever", age: "4y", vacc: "up_to_date" as const },
  { name: "Bella", breed: "Cavoodle",         age: "2y", vacc: "expiring"   as const },
];

export function CustomerProfileModal({ onClose }: { onClose?: () => void }) {
  return (
    <ModalShell
      wide
      onClose={onClose}
      title={
        <div className="flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-full bg-sk-coral-soft text-sk-coral-dark font-semibold">SJ</div>
          <div>
            <div className="text-lg font-semibold leading-tight">Sarah Johnson</div>
            <div className="text-xs text-muted-foreground">Customer #SK-1042 · Since Apr 2023</div>
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
            <span>Outstanding: <span className="font-semibold text-sk-coral-dark">R 480.00</span></span>
            <span>Lifetime value: <span className="font-semibold text-foreground">R 24 810</span></span>
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
        <div className="flex items-center gap-2 text-sm"><Mail className="h-4 w-4 text-muted-foreground" /> sarah.johnson@example.com</div>
        <div className="flex items-center gap-2 text-sm"><Phone className="h-4 w-4 text-muted-foreground" /> +27 82 555 0142</div>
        <div className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 text-muted-foreground" /> 14 Acacia Rd, Bryanston</div>
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
        <div className="grid gap-3 sm:grid-cols-2">
          {pets.map((p) => (
            <div key={p.name} className="flex items-center gap-3 rounded-xl border border-border bg-white p-3">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-sk-turquoise-soft text-sk-turquoise-dark font-semibold">
                {p.name[0]}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">{p.name}</div>
                <div className="text-xs text-muted-foreground">{p.breed} · {p.age}</div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <StatusBadge status={p.vacc} />
                <button className="text-xs font-medium text-sk-coral-dark hover:underline">View pet</button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </ModalShell>
  );
}