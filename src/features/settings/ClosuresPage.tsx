import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Trash2, Pencil, CalendarOff, Gift } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";

interface Closure {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  services: string[];
  bill_anyway: boolean;
  notes: string | null;
}

const SERVICES = [
  { value: "daycare", label: "Daycare" },
  { value: "hotel", label: "Hotel & Cattery" },
  { value: "grooming", label: "Grooming" },
  { value: "transport", label: "Pickup / Drop-off" },
];

const empty = {
  name: "",
  start_date: format(new Date(), "yyyy-MM-dd"),
  end_date: format(new Date(), "yyyy-MM-dd"),
  services: [] as string[],
  bill_anyway: false,
  notes: "",
};

export default function ClosuresPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Closure | "new" | null>(null);

  const q = useQuery({
    queryKey: ["closures", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closures" as any)
        .select("*")
        .eq("tenant_id", tenantId!)
        .order("start_date", { ascending: true });
      if (error) throw error;
      return (data ?? []) as unknown as Closure[];
    },
  });

  const save = useMutation({
    mutationFn: async ({ id, ...values }: any) => {
      if (id) {
        const { error } = await supabase.from("closures" as any).update(values).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("closures" as any)
          .insert({ ...values, tenant_id: tenantId });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closures"] });
      setEditing(null);
      toast.success("Closure saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("closures" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["closures"] });
      toast.success("Closure removed");
    },
  });

  const grant = useMutation({
    mutationFn: async (c: Closure) => {
      const { data, error } = await supabase.rpc("daycare_grant_closure_credits" as any, {
        p_tenant_id: tenantId,
        p_start: c.start_date,
        p_end: c.end_date,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      qc.invalidateQueries({ queryKey: ["daycare_catchup_credits"] });
      toast.success(n ? `${n} catch-up credit${n === 1 ? "" : "s"} granted` : "No enrolled daycare days in that closure");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not grant credits"),
  });

  return (
    <>
      <AppHeader
        title="Closures & public holidays"
        subtitle="Days you are shut. Daycare pro-rata skips these days and bookings are blocked."
        actions={
          <button
            onClick={() => setEditing("new")}
            className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> Add closure
          </button>
        }
      />

      <div className="p-4 sm:p-6">
        <div className="overflow-hidden rounded-xl border border-border bg-white">
          {q.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {!q.isLoading && (q.data?.length ?? 0) === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              <CalendarOff className="mx-auto mb-2 h-6 w-6" />
              No closures yet. Add public holidays and shut days so customers are not billed or booked in.
            </div>
          )}
          {(q.data ?? []).map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">
                  {format(new Date(c.start_date), "dd MMM yyyy")}
                  {c.end_date !== c.start_date && <> – {format(new Date(c.end_date), "dd MMM yyyy")}</>}
                  {" · "}
                  {c.services.length === 0
                    ? "All services"
                    : c.services.map((s) => SERVICES.find((x) => x.value === s)?.label ?? s).join(", ")}
                  {c.bill_anyway && " · still billed"}
                </div>
              </div>
              <button
                onClick={() => setEditing(c)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted"
              >
                <Pencil className="h-4 w-4" />
              </button>
              <button
                title="Grant daycare catch-up credits for this closure"
                disabled={grant.isPending}
                onClick={() => grant.mutate(c)}
                className="grid h-9 w-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted disabled:opacity-60"
              >
                <Gift className="h-4 w-4" />
              </button>
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: `Remove "${c.name}"?`,
                    confirmLabel: "Remove",
                    tone: "destructive",
                  });
                  if (ok) remove.mutate(c.id);
                }}
                className="grid h-9 w-9 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {editing && (
        <ClosureModal
          initial={editing === "new" ? null : editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
        />
      )}
    </>
  );
}

function ClosureModal({
  initial,
  saving,
  onClose,
  onSave,
}: {
  initial: Closure | null;
  saving: boolean;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const [form, setForm] = useState({
    ...empty,
    ...(initial
      ? {
          name: initial.name,
          start_date: initial.start_date,
          end_date: initial.end_date,
          services: initial.services ?? [],
          bill_anyway: initial.bill_anyway,
          notes: initial.notes ?? "",
        }
      : {}),
  });

  function toggleService(v: string) {
    setForm((f) => ({
      ...f,
      services: f.services.includes(v) ? f.services.filter((s) => s !== v) : [...f.services, v],
    }));
  }

  return (
    <ModalShell
      title={initial ? "Edit closure" : "Add closure"}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={saving || !form.name.trim()}
            onClick={() => onSave({ id: initial?.id, ...form, notes: form.notes.trim() || null })}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            Save
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="e.g. Heritage Day"
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          />
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <input
              type="date"
              value={form.start_date}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  start_date: e.target.value,
                  end_date: f.end_date < e.target.value ? e.target.value : f.end_date,
                }))
              }
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <input
              type="date"
              value={form.end_date}
              min={form.start_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            />
          </div>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Applies to</label>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {SERVICES.map((s) => {
              const on = form.services.includes(s.value);
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => toggleService(s.value)}
                  className={
                    "rounded-full border px-3 py-1 text-xs font-medium " +
                    (on ? "border-sk-coral bg-sk-coral text-white" : "border-border bg-white hover:bg-muted")
                  }
                >
                  {s.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">Leave all unselected to close the whole business.</p>
        </div>
        <label className="flex items-start gap-2 rounded-lg border border-border p-3">
          <input
            type="checkbox"
            checked={form.bill_anyway}
            onChange={(e) => setForm({ ...form, bill_anyway: e.target.checked })}
            className="mt-0.5 h-4 w-4 accent-sk-coral"
          />
          <span>
            <span className="font-medium">Still bill for these days</span>
            <span className="block text-xs text-muted-foreground">
              Off by default — daycare pro-rata will not charge for closed days.
            </span>
          </span>
        </label>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Notes</label>
          <textarea
            rows={2}
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          />
        </div>
      </div>
    </ModalShell>
  );
}