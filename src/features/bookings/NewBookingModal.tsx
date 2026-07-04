import { useState } from "react";
import { ModalShell } from "@/components/modals/ModalShell";
import { CalendarDays, Clock, User, PawPrint, Repeat, Scissors, Truck, ArrowLeftRight } from "lucide-react";

const serviceTabs = [
  { key: "inhouse", label: "In-House Grooming", icon: Scissors },
  { key: "mobile",  label: "Mobile Grooming",   icon: Truck },
  { key: "pickup",  label: "Pick Up / Drop Off", icon: ArrowLeftRight },
] as const;

function Field({ label, icon: Icon, children }: { label: string; icon?: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {Icon && <Icon className="h-3.5 w-3.5" />} {label}
      </span>
      {children}
    </label>
  );
}

const inputCls = "h-10 w-full rounded-xl border border-border bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40";

export function NewBookingModal({ onClose }: { onClose?: () => void }) {
  const [tab, setTab] = useState<typeof serviceTabs[number]["key"]>("inhouse");
  const [recurring, setRecurring] = useState(false);
  return (
    <ModalShell
      wide
      onClose={onClose}
      title="New booking"
      subtitle="Create a confirmed booking on behalf of a customer"
      footer={
        <div className="flex items-center justify-between">
          <button className="text-sm font-medium text-muted-foreground hover:text-foreground">Save as draft</button>
          <div className="flex gap-2">
            <button className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-white">Cancel</button>
            <button className="h-9 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark">
              Save booking
            </button>
          </div>
        </div>
      }
    >
      {/* Service tabs */}
      <div className="border-b border-border bg-sk-surface-muted p-4">
        <div className="grid grid-cols-3 gap-2">
          {serviceTabs.map((s) => {
            const Icon = s.icon;
            const active = tab === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setTab(s.key)}
                className={
                  "flex items-center gap-2 rounded-xl border px-4 py-3 text-sm font-medium transition-colors " +
                  (active
                    ? "border-sk-coral bg-white text-sk-coral-dark shadow-sm"
                    : "border-transparent text-muted-foreground hover:bg-white/60")
                }
              >
                <Icon className="h-4 w-4" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-4 p-6 sm:grid-cols-2">
        <Field label="Customer" icon={User}>
          <input className={inputCls} defaultValue="Sarah Johnson (SK-1042)" />
        </Field>
        <Field label="Pet" icon={PawPrint}>
          <select className={inputCls} defaultValue="max">
            <option value="max">Max — Golden Retriever</option>
            <option value="bella">Bella — Cavoodle</option>
          </select>
        </Field>
        <Field label="Date" icon={CalendarDays}>
          <input type="date" className={inputCls} defaultValue="2026-07-09" />
        </Field>
        <Field label="Time" icon={Clock}>
          <input type="time" className={inputCls} defaultValue="09:30" />
        </Field>
        <Field label="Duration">
          <select className={inputCls} defaultValue="90">
            <option value="30">30 minutes</option>
            <option value="60">1 hour</option>
            <option value="90">1h 30m</option>
            <option value="120">2 hours</option>
          </select>
        </Field>
        <Field label={tab === "mobile" ? "Van / Driver" : tab === "pickup" ? "Driver" : "Groomer"}>
          <select className={inputCls}>
            <option>Nomvula</option>
            <option>Kagiso</option>
            <option>Sipho</option>
          </select>
        </Field>
        <Field label="Service type">
          <select className={inputCls}>
            <option>Full groom</option>
            <option>Bath & tidy</option>
            <option>Nail trim</option>
            <option>De-shed</option>
          </select>
        </Field>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recurring}
              onChange={(e) => setRecurring(e.target.checked)}
              className="h-4 w-4 rounded border-border text-sk-coral focus:ring-sk-coral"
            />
            <Repeat className="h-4 w-4 text-muted-foreground" />
            Recurring booking
          </label>
        </div>
        <div className="sm:col-span-2">
          <Field label="Notes">
            <textarea rows={3} className="w-full rounded-xl border border-border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sk-coral/40" placeholder="Anything the team should know..." />
          </Field>
        </div>
      </div>
    </ModalShell>
  );
}