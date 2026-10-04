import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Play, CheckCircle2, Home } from "lucide-react";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useGroomers } from "@/features/settings/resourceQueries";
import { useGroomingBoardBookings, type GroomingBoardCard } from "../queries";
import { useDaycarePetIdsForDay } from "../daycareLink";
import { usePetAlerts } from "@/features/lists/queries";
import { useBookingInstructions, usePetGroomingDefaults } from "../instructions/queries";
import { GroomingInstructionsForm } from "../instructions/GroomingInstructionsForm";
import { WorkSheet, BigButton } from "@/features/work/WorkSheet";
import { PinPad } from "./PinPad";
import { kioskAction, useKioskGroomerNames } from "./kioskQueries";
import { useQueryClient } from "@tanstack/react-query";

const fmt = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString("en-ZA", { hour: "2-digit", minute: "2-digit" }) : "—";

function statusLabel(s: string) {
  if (s === "grooming" || s === "in_progress") return { text: "On the table", cls: "bg-sk-orange text-white" };
  if (s === "ready") return { text: "Ready", cls: "bg-sk-green text-white" };
  if (s === "checked_in") return { text: "Arrived", cls: "bg-primary/15 text-primary" };
  return { text: "Booked", cls: "bg-muted text-muted-foreground" };
}

export default function GroomingKioskPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const day = useMemo(() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; }, []);
  const qc = useQueryClient();
  const bookingsQ = useGroomingBoardBookings({ tenantId, day });
  const stationsQ = useGroomers(tenantId, { activeOnly: true });
  const cards = bookingsQ.data ?? [];
  const names = useKioskGroomerNames(cards.map((c) => c.id));
  const daycare = useDaycarePetIdsForDay(tenantId, day);
  const alertsQ = usePetAlerts(tenantId, cards.flatMap((c) => c.pets.map((p) => p.id)));

  const [open, setOpen] = useState<GroomingBoardCard | null>(null);
  const [pending, setPending] = useState<{ action: "start" | "finish"; notes?: string } | null>(null);
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  const lanes = useMemo(() => {
    const stations = stationsQ.data ?? [];
    const out = stations.map((s) => ({ id: s.id as string | null, name: s.name, cards: cards.filter((c) => c.resource_id === s.id) }));
    const loose = cards.filter((c) => !c.resource_id || !stations.some((s) => s.id === c.resource_id));
    if (loose.length) out.push({ id: null, name: "No station", cards: loose });
    return out;
  }, [stationsQ.data, cards]);

  async function submitPin(pin: string) {
    if (!open || !pending) return;
    setBusy(true); setPinError(null);
    try {
      const who = await kioskAction({ bookingId: open.id, pin, action: pending.action, notes: pending.notes });
      const pet = open.pets.map((p) => p.name).join(" & ");
      const inDaycare = open.pets.some((p) => daycare.has(p.id));
      toast.success(
        pending.action === "start"
          ? `Hello ${who} — ${pet} is on your table.`
          : `Thanks ${who} — ${pet} is ready${inDaycare ? ". Return to daycare." : "."}`,
      );
      setPending(null); setOpen(null); setNotes("");
      qc.invalidateQueries({ queryKey: ["grooming_board"] });
      qc.invalidateQueries({ queryKey: ["grooming_kiosk_names"] });
    } catch (e: any) {
      setPinError(e?.message ?? "Couldn't save");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen bg-sk-surface-muted">
      <header className="flex items-center justify-between gap-3 border-b border-border bg-background px-4 py-3">
        <div className="flex items-center gap-3">
          <Link to="/admin/grooming" className="grid h-11 w-11 place-items-center rounded-xl border border-border" aria-label="Back to admin">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-bold">Grooming parlour</h1>
            <p className="text-sm text-muted-foreground">
              {day.toLocaleDateString("en-ZA", { weekday: "long", day: "2-digit", month: "short", year: "numeric" })} · tap a dog to start or finish
            </p>
          </div>
        </div>
      </header>

      {bookingsQ.isLoading ? (
        <p className="p-6 text-muted-foreground">Loading today's grooms…</p>
      ) : cards.length === 0 ? (
        <p className="p-6 text-lg text-muted-foreground">No grooms booked today.</p>
      ) : (
        <div className="grid gap-4 p-4" style={{ gridTemplateColumns: `repeat(${Math.max(1, lanes.length)}, minmax(220px, 1fr))` }}>
          {lanes.map((lane) => (
            <section key={lane.id ?? "none"} className="flex flex-col gap-3">
              <h2 className="rounded-xl bg-background px-3 py-2 text-lg font-bold">{lane.name}</h2>
              {lane.cards.map((c) => {
                const st = statusLabel(c.status);
                const who = names.data?.[c.id]?.groomer;
                const alerts = c.pets.flatMap((p) => alertsQ.data?.[p.id]?.alerts ?? []);
                return (
                  <button
                    key={c.id}
                    onClick={() => { setOpen(c); setNotes(""); }}
                    className={"rounded-2xl border border-border bg-background p-4 text-left shadow-sm active:scale-[0.99] " + (c.status === "ready" ? "opacity-70" : "")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-2xl font-bold">{fmt(c.start_at)}</span>
                      <span className={"rounded-full px-2.5 py-1 text-xs font-bold " + st.cls}>{st.text}</span>
                    </div>
                    <div className="mt-1 text-lg font-semibold">{c.pets.map((p) => p.name).join(" & ") || "Pet"}</div>
                    <div className="text-sm text-muted-foreground">{c.pets.map((p) => p.breed).filter(Boolean).join(", ")}</div>
                    {who && (c.status === "grooming" || c.status === "in_progress" || c.status === "ready") && (
                      <div className="mt-1 text-sm font-medium">✂ {who}</div>
                    )}
                    {alerts.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1">
                        {alerts.map((a) => <span key={a} className="rounded bg-destructive/10 px-1.5 py-0.5 text-xs font-semibold text-destructive">{a}</span>)}
                      </div>
                    )}
                    {c.pets.some((p) => daycare.has(p.id)) && (
                      <div className="mt-2 inline-flex items-center gap-1 rounded bg-sk-green-soft px-1.5 py-0.5 text-xs font-semibold">
                        <Home className="h-3 w-3" /> In daycare
                      </div>
                    )}
                  </button>
                );
              })}
            </section>
          ))}
        </div>
      )}

      {open && (
        <WorkSheet
          title={`${fmt(open.start_at)} · ${open.pets.map((p) => p.name).join(" & ")}`}
          onClose={() => setOpen(null)}
          footer={
            open.status === "grooming" || open.status === "in_progress" ? (
              <BigButton tone="green" onClick={() => { setPinError(null); setPending({ action: "finish", notes }); }}>
                <CheckCircle2 className="h-6 w-6" /> Finish — mark ready
              </BigButton>
            ) : open.status === "ready" ? (
              <BigButton tone="neutral" onClick={() => setOpen(null)}>Already finished</BigButton>
            ) : (
              <BigButton onClick={() => { setPinError(null); setPending({ action: "start" }); }}>
                <Play className="h-6 w-6" /> Start groom
              </BigButton>
            )
          }
        >
          <KioskBrief card={open} tenantId={tenantId} alerts={open.pets.flatMap((p) => alertsQ.data?.[p.id]?.alerts ?? [])}
            medical={open.pets.map((p) => alertsQ.data?.[p.id]?.medical).filter(Boolean).join(" · ")}
            existingNotes={names.data?.[open.id]?.notes ?? null}
            inDaycare={open.pets.some((p) => daycare.has(p.id))}
          />
          {(open.status === "grooming" || open.status === "in_progress") && (
            <label className="mt-4 block">
              <span className="mb-1 block text-base font-semibold">Notes (coat, matting, behaviour)</span>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="w-full rounded-xl border border-border bg-background p-3 text-base"
                placeholder="Optional"
              />
            </label>
          )}
        </WorkSheet>
      )}

      {pending && open && (
        <PinPad
          title={pending.action === "start" ? "Who's grooming?" : "Who finished?"}
          subtitle="Enter your 4-digit groomer PIN"
          busy={busy}
          error={pinError}
          onSubmit={submitPin}
          onCancel={() => setPending(null)}
        />
      )}
    </div>
  );
}

function KioskBrief({
  card, tenantId, alerts, medical, existingNotes, inDaycare,
}: {
  card: GroomingBoardCard; tenantId: string | null; alerts: string[]; medical: string; existingNotes: string | null; inDaycare: boolean;
}) {
  const bookingQ = useBookingInstructions(card.id);
  const petId = card.pets[0]?.id ?? null;
  const defaultsQ = usePetGroomingDefaults(!bookingQ.isLoading && !bookingQ.data ? petId : null);
  const src: any = bookingQ.data ?? defaultsQ.data ?? null;
  const value = {
    selections: src?.selections ?? {},
    medical_flags: src?.medical_flags ?? [],
    notes: src?.notes ?? "",
    told_office_to_call: src?.told_office_to_call ?? "",
  };
  return (
    <div className="space-y-4">
      <div className="text-base">
        <div><span className="text-muted-foreground">Owner:</span> <b>{card.customer?.full_name ?? "—"}</b></div>
        <div><span className="text-muted-foreground">Breed:</span> {card.pets.map((p) => p.breed).filter(Boolean).join(", ") || "—"}</div>
        {inDaycare && <div className="mt-1 font-semibold text-sk-green">In daycare today — return to daycare when ready</div>}
      </div>
      {(alerts.length > 0 || medical) && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-3">
          <div className="flex flex-wrap gap-1">
            {alerts.map((a) => <span key={a} className="rounded bg-destructive/15 px-2 py-0.5 text-sm font-bold text-destructive">{a}</span>)}
          </div>
          {medical && <p className="mt-1 text-sm">{medical}</p>}
        </div>
      )}
      <div>
        <h3 className="mb-2 text-lg font-bold">Grooming brief</h3>
        {src ? (
          <GroomingInstructionsForm tenantId={tenantId ?? ""} value={value} onChange={() => {}} disabled compact />
        ) : (
          <p className="text-muted-foreground">No styling preferences saved — check with front desk.</p>
        )}
      </div>
      {existingNotes && (
        <div>
          <h3 className="mb-1 text-lg font-bold">Notes</h3>
          <p className="whitespace-pre-wrap text-base">{existingNotes}</p>
        </div>
      )}
    </div>
  );
}
