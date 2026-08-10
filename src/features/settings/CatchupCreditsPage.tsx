import { useMemo, useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { CalendarPlus, Check, Clock, RotateCcw, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";

type Credit = {
  id: string;
  customer_id: string;
  pet_id: string | null;
  missed_date: string;
  reason: string;
  status: string;
  expires_on: string;
  used_on: string | null;
  notes: string | null;
  customers?: { first_name: string | null; last_name: string | null; customer_number: string | null } | null;
  pets?: { name: string | null } | null;
};

const STATUSES = ["available", "used", "expired", "cancelled"] as const;

const statusTone: Record<string, string> = {
  available: "bg-emerald-50 text-emerald-700 border-emerald-200",
  used: "bg-muted text-muted-foreground border-border",
  expired: "bg-amber-50 text-amber-700 border-amber-200",
  cancelled: "bg-destructive/10 text-destructive border-destructive/20",
};

export default function CatchupCreditsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [status, setStatus] = useState<string>("available");
  const [granting, setGranting] = useState(false);
  const [redeeming, setRedeeming] = useState<Credit | null>(null);

  const q = useQuery({
    queryKey: ["daycare_catchup_credits", tenantId, status],
    enabled: !!tenantId,
    queryFn: async () => {
      let query = supabase
        .from("daycare_catchup_credits" as any)
        .select("*, customers(first_name,last_name,customer_number), pets(name)")
        .eq("tenant_id", tenantId!)
        .order("missed_date", { ascending: false })
        .limit(500);
      if (status !== "all") query = query.eq("status", status);
      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as Credit[];
    },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ["daycare_catchup_credits"] });

  const expire = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("daycare_expire_catchup_credits" as any, {
        p_tenant_id: tenantId,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      invalidate();
      toast.success(n ? `${n} credit${n === 1 ? "" : "s"} expired` : "Nothing to expire");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not expire credits"),
  });

  const redeem = useMutation({
    mutationFn: async ({ id, used_on }: { id: string; used_on: string }) => {
      const { error } = await supabase.rpc("daycare_redeem_catchup_credit" as any, {
        p_credit_id: id,
        p_used_on: used_on,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      setRedeeming(null);
      toast.success("Catch-up day used");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not redeem"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("daycare_catchup_credits" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      invalidate();
      toast.success("Credit removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  const rows = q.data ?? [];
  const counts = useMemo(() => rows.length, [rows]);

  return (
    <>
      <AppHeader
        title="Daycare catch-up credits"
        subtitle="Missed days from closures or illness. Credits expire after the catch-up window set in Policies."
        actions={
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setGranting(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:opacity-90"
            >
              <CalendarPlus className="h-4 w-4" /> Grant for closures
            </button>
            <button
              onClick={() => expire.mutate()}
              disabled={expire.isPending}
              className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
            >
              <Clock className="h-4 w-4" /> Expire overdue
            </button>
          </div>
        }
      />

      <div className="p-4 sm:p-6">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {["all", ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setStatus(s)}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium capitalize " +
                (status === s ? "border-sk-coral bg-sk-coral text-white" : "border-border bg-white hover:bg-muted")
              }
            >
              {s}
            </button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-border bg-white">
          {q.isLoading && <p className="p-6 text-sm text-muted-foreground">Loading…</p>}
          {!q.isLoading && counts === 0 && (
            <div className="p-8 text-center text-sm text-muted-foreground">
              No catch-up credits here yet.
            </div>
          )}
          {rows.map((c) => (
            <div key={c.id} className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-3 last:border-0">
              <div className="min-w-0 flex-1">
                <div className="font-medium">
                  {c.pets?.name ? `${c.pets.name} · ` : ""}
                  {[c.customers?.first_name, c.customers?.last_name].filter(Boolean).join(" ") || "Customer"}
                  {c.customers?.customer_number ? ` (${c.customers.customer_number})` : ""}
                </div>
                <div className="text-xs text-muted-foreground">
                  Missed {format(new Date(c.missed_date), "dd MMM yyyy")} · {c.reason} · expires{" "}
                  {format(new Date(c.expires_on), "dd MMM yyyy")}
                  {c.used_on && ` · used ${format(new Date(c.used_on), "dd MMM yyyy")}`}
                </div>
              </div>
              <span className={"rounded-full border px-2 py-0.5 text-[11px] font-medium capitalize " + (statusTone[c.status] ?? "")}>
                {c.status}
              </span>
              {c.status === "available" && (
                <button
                  onClick={() => setRedeeming(c)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  <Check className="h-3.5 w-3.5" /> Use
                </button>
              )}
              <button
                onClick={async () => {
                  const ok = await confirm({
                    title: "Remove this credit?",
                    confirmLabel: "Remove",
                    tone: "destructive",
                  });
                  if (ok) remove.mutate(c.id);
                }}
                className="grid h-8 w-8 place-items-center rounded-lg text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
        </div>
      </div>

      {granting && (
        <GrantModal
          tenantId={tenantId}
          onClose={() => setGranting(false)}
          onDone={() => {
            setGranting(false);
            invalidate();
          }}
        />
      )}

      {redeeming && (
        <RedeemModal
          credit={redeeming}
          saving={redeem.isPending}
          onClose={() => setRedeeming(null)}
          onSave={(used_on) => redeem.mutate({ id: redeeming.id, used_on })}
        />
      )}
    </>
  );
}

function GrantModal({
  tenantId,
  onClose,
  onDone,
}: {
  tenantId: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const today = format(new Date(), "yyyy-MM-dd");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);

  const run = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("daycare_grant_closure_credits" as any, {
        p_tenant_id: tenantId,
        p_start: start,
        p_end: end,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: (n) => {
      toast.success(n ? `${n} catch-up credit${n === 1 ? "" : "s"} granted` : "No enrolled days fell on a closure");
      onDone();
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not grant credits"),
  });

  return (
    <ModalShell
      title="Grant catch-up credits for closures"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={run.isPending}
            onClick={() => run.mutate()}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            <RotateCcw className="mr-2 inline h-4 w-4" />
            {run.isPending ? "Granting…" : "Grant credits"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <p className="text-muted-foreground">
          Every enrolled daycare day inside this range that falls on a closure gets one catch-up credit. Running it twice
          is safe — existing credits are left alone.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground">From</label>
            <input
              type="date"
              value={start}
              onChange={(e) => {
                setStart(e.target.value);
                if (end < e.target.value) setEnd(e.target.value);
              }}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground">To</label>
            <input
              type="date"
              value={end}
              min={start}
              onChange={(e) => setEnd(e.target.value)}
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            />
          </div>
        </div>
      </div>
    </ModalShell>
  );
}

function RedeemModal({
  credit,
  saving,
  onClose,
  onSave,
}: {
  credit: Credit;
  saving: boolean;
  onClose: () => void;
  onSave: (usedOn: string) => void;
}) {
  const [usedOn, setUsedOn] = useState(format(new Date(), "yyyy-MM-dd"));
  return (
    <ModalShell
      title="Use catch-up day"
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            disabled={saving}
            onClick={() => onSave(usedOn)}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Mark used"}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm">
        <p className="text-muted-foreground">
          Credit for {format(new Date(credit.missed_date), "dd MMM yyyy")}, expires{" "}
          {format(new Date(credit.expires_on), "dd MMM yyyy")}.
        </p>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Day attended</label>
          <input
            type="date"
            value={usedOn}
            onChange={(e) => setUsedOn(e.target.value)}
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
          />
        </div>
      </div>
    </ModalShell>
  );
}
