import { useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { CheckCircle2, Plus, ShieldAlert, Stethoscope, Trash2 } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import {
  HOLD_REASONS,
  holdReasonLabel,
  useClearHealthHold,
  useCreateHealthHold,
  useDeleteTreatment,
  useParasiteRules,
  usePetHealthGate,
  usePetHealthHolds,
  usePetParasiteTreatments,
  useRecordTreatment,
} from "./healthQueries";

const PERMISSION = "pets.manage";

const STATUS_TONE: Record<string, string> = {
  ok: "bg-sk-turquoise-soft text-sk-turquoise-dark",
  due: "bg-sk-orange-soft text-sk-orange",
  overdue: "bg-sk-coral-soft text-sk-coral-dark",
  missing: "bg-sk-coral-soft text-sk-coral-dark",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "Up to date",
  due: "Due",
  overdue: "Overdue",
  missing: "Not recorded",
};

function fmt(d?: string | null) {
  return d ? format(new Date(d), "dd MMM yyyy") : "—";
}

export function PetHealthPanel({
  tenantId,
  petId,
  readOnly = false,
}: {
  tenantId: string;
  petId: string;
  readOnly?: boolean;
}) {
  const { hasPermission } = useCurrentUser();
  const canManage = !readOnly && hasPermission(PERMISSION);
  const confirm = useConfirm();

  const rulesQ = useParasiteRules(tenantId, { activeOnly: true });
  const gateQ = usePetHealthGate(petId);
  const treatmentsQ = usePetParasiteTreatments(tenantId, petId);
  const holdsQ = usePetHealthHolds(tenantId, petId);
  const del = useDeleteTreatment();
  const clearHold = useClearHealthHold();

  const [recording, setRecording] = useState<string | null>(null);
  const [addingHold, setAddingHold] = useState(false);

  const gateRows = gateQ.data?.treatments ?? [];
  const openHolds = useMemo(() => (holdsQ.data ?? []).filter((h) => !h.cleared_at), [holdsQ.data]);
  const pastHolds = useMemo(() => (holdsQ.data ?? []).filter((h) => h.cleared_at), [holdsQ.data]);

  return (
    <div className="space-y-6">
      {/* Parasite & preventative treatments */}
      <div>
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Parasite &amp; preventative treatments</div>
          {canManage && (rulesQ.data?.length ?? 0) > 0 && (
            <button
              onClick={() => setRecording(rulesQ.data![0].kind)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <Plus className="h-3.5 w-3.5" /> Record treatment
            </button>
          )}
        </div>

        {gateRows.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            No treatment rules configured yet. Set them up in Settings → Parasite treatments.
          </p>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border">
            {gateRows.map((row) => (
              <div key={row.kind} className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-2.5 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{row.label}</div>
                  <div className="text-[11px] text-muted-foreground">
                    Last {fmt(row.last_administered)} · next due {fmt(row.next_due_date)}
                  </div>
                </div>
                <span className={"rounded-full px-2 py-0.5 text-[11px] font-medium " + (STATUS_TONE[row.status] ?? "")}>
                  {STATUS_LABEL[row.status] ?? row.status}
                </span>
                {canManage && (
                  <button
                    onClick={() => setRecording(row.kind)}
                    className="rounded-lg px-2.5 py-1 text-xs font-medium text-sk-coral-dark hover:bg-sk-coral-soft"
                  >
                    Record
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {(treatmentsQ.data?.length ?? 0) > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Treatment history ({treatmentsQ.data!.length})
            </summary>
            <div className="mt-2 space-y-1">
              {treatmentsQ.data!.map((t) => (
                <div key={t.id} className="flex items-center gap-2 rounded-lg bg-muted/50 px-3 py-1.5 text-xs">
                  <span className="font-medium">{rulesQ.data?.find((r) => r.kind === t.kind)?.label ?? t.kind}</span>
                  <span className="text-muted-foreground">
                    {fmt(t.administered_on)}
                    {t.product_name ? ` · ${t.product_name}` : ""}
                    {t.notes ? ` · ${t.notes}` : ""}
                  </span>
                  {canManage && (
                    <button
                      onClick={async () => {
                        if (!(await confirm({ title: "Remove this treatment record?", confirmLabel: "Remove", tone: "destructive" }))) return;
                        try { await del.mutateAsync(t.id); toast.success("Removed"); }
                        catch (e: any) { toast.error(e?.message ?? "Could not remove"); }
                      }}
                      className="ml-auto grid h-6 w-6 place-items-center rounded text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {/* Health holds */}
      <div className="border-t border-border pt-5">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">Not fit to attend</div>
          {canManage && (
            <button
              onClick={() => setAddingHold(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
            >
              <ShieldAlert className="h-3.5 w-3.5" /> Add hold
            </button>
          )}
        </div>

        {openHolds.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">
            No active holds — this pet is clear to attend.
          </p>
        ) : (
          <div className="space-y-2">
            {openHolds.map((h) => (
              <div
                key={h.id}
                className={
                  "rounded-lg border px-3 py-2 " +
                  (h.blocks_attendance ? "border-sk-coral bg-sk-coral-soft" : "border-sk-orange bg-sk-orange-soft")
                }
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold">{holdReasonLabel(h.reason)}</span>
                  <span className="text-[11px] text-muted-foreground">
                    since {fmt(h.started_on)}
                    {h.expected_clear_on ? ` · expected clear ${fmt(h.expected_clear_on)}` : ""}
                  </span>
                  <span className="rounded-full bg-white/70 px-2 py-0.5 text-[11px] font-medium">
                    {h.blocks_attendance ? "Blocks attendance" : "Warning only"}
                  </span>
                  {canManage && (
                    <button
                      onClick={async () => {
                        if (!(await confirm({
                          title: "Clear this hold?",
                          description: "Only clear once a vet clearance certificate has been received and uploaded to this pet's documents.",
                          confirmLabel: "Clear hold",
                        }))) return;
                        try { await clearHold.mutateAsync({ id: h.id }); toast.success("Hold cleared"); }
                        catch (e: any) { toast.error(e?.message ?? "Could not clear"); }
                      }}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 text-xs font-medium hover:bg-white/80"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" /> Clear with vet certificate
                    </button>
                  )}
                </div>
                {h.notes && <div className="mt-1 text-xs">{h.notes}</div>}
              </div>
            ))}
          </div>
        )}

        {pastHolds.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-xs font-medium text-muted-foreground">
              Cleared holds ({pastHolds.length})
            </summary>
            <div className="mt-2 space-y-1">
              {pastHolds.map((h) => (
                <div key={h.id} className="rounded-lg bg-muted/50 px-3 py-1.5 text-xs text-muted-foreground">
                  {holdReasonLabel(h.reason)} · {fmt(h.started_on)} → cleared {fmt(h.cleared_at)}
                  {h.clearance_notes ? ` · ${h.clearance_notes}` : ""}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>

      {recording && (
        <RecordTreatmentModal
          tenantId={tenantId}
          petId={petId}
          kinds={(rulesQ.data ?? []).map((r) => ({ kind: r.kind, label: r.label }))}
          initialKind={recording}
          onClose={() => setRecording(null)}
        />
      )}

      {addingHold && <AddHoldModal tenantId={tenantId} petId={petId} onClose={() => setAddingHold(false)} />}
    </div>
  );
}

function RecordTreatmentModal({
  tenantId,
  petId,
  kinds,
  initialKind,
  onClose,
}: {
  tenantId: string;
  petId: string;
  kinds: Array<{ kind: string; label: string }>;
  initialKind: string;
  onClose: () => void;
}) {
  const record = useRecordTreatment(tenantId, petId);
  const [kind, setKind] = useState(initialKind);
  const [date, setDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [product, setProduct] = useState("");
  const [notes, setNotes] = useState("");

  async function save() {
    try {
      await record.mutateAsync({ kind, administered_on: date, product_name: product || null, notes: notes || null });
      toast.success("Treatment recorded");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); }
  }

  return (
    <ModalShell
      title="Record treatment"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button disabled={record.isPending} onClick={save} className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {record.isPending ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Treatment</span>
          <select value={kind} onChange={(e) => setKind(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border px-3">
            {kinds.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Date given</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Product used</span>
          <input value={product} onChange={(e) => setProduct(e.target.value)} placeholder="e.g. Bravecto" className="mt-1 h-10 w-full rounded-lg border border-border px-3" />
        </label>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border px-3 py-2" />
        </label>
        <p className="text-[11px] text-muted-foreground">
          The next due date is worked out automatically from the interval set in Settings → Parasite treatments.
        </p>
      </div>
    </ModalShell>
  );
}

function AddHoldModal({ tenantId, petId, onClose }: { tenantId: string; petId: string; onClose: () => void }) {
  const create = useCreateHealthHold(tenantId, petId);
  const [reason, setReason] = useState<string>(HOLD_REASONS[0].value);
  const [notes, setNotes] = useState("");
  const [startedOn, setStartedOn] = useState(format(new Date(), "yyyy-MM-dd"));
  const [expected, setExpected] = useState("");
  const [blocks, setBlocks] = useState(true);

  async function save() {
    try {
      await create.mutateAsync({
        reason,
        notes: notes || null,
        started_on: startedOn,
        expected_clear_on: expected || null,
        blocks_attendance: blocks,
      });
      toast.success("Hold added");
      onClose();
    } catch (e: any) { toast.error(e?.message ?? "Could not save"); }
  }

  return (
    <ModalShell
      title="Mark not fit to attend"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">Cancel</button>
          <button disabled={create.isPending} onClick={save} className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60">
            {create.isPending ? "Saving…" : "Add hold"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <div className="flex items-start gap-2 rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
          <Stethoscope className="mt-0.5 h-4 w-4 shrink-0" />
          A hold can only be cleared by staff, once a vet clearance certificate has been received.
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border px-3">
            {HOLD_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Started on</span>
            <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border px-3" />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">Expected clear (optional)</span>
            <input type="date" value={expected} onChange={(e) => setExpected(e.target.value)} className="mt-1 h-10 w-full rounded-lg border border-border px-3" />
          </label>
        </div>
        <label className="block">
          <span className="text-xs font-medium text-muted-foreground">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className="mt-1 w-full rounded-lg border border-border px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={blocks} onChange={(e) => setBlocks(e.target.checked)} className="h-4 w-4" />
          Block attendance while this hold is active
        </label>
      </div>
    </ModalShell>
  );
}