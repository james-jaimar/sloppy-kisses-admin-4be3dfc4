import { useState } from "react";
import { toast } from "sonner";
import { TrendingUp, Check } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";

type PreviewRow = {
  table: string;
  id: string;
  label: string;
  old_price: number;
  new_price: number;
};

type Preview = { percent: number; dry_run: boolean; count: number; rows: PreviewRow[] };

const TARGETS = [
  { value: "daycare", label: "Daycare plans" },
  { value: "hotel", label: "Hotel rates & surcharges" },
  { value: "grooming", label: "Grooming packages & add-ons" },
];

const TABLE_LABELS: Record<string, string> = {
  daycare_plans: "Daycare plan",
  hotel_rate_cards: "Hotel rate",
  hotel_surcharges: "Hotel surcharge",
  grooming_packages: "Grooming package",
  grooming_addons: "Grooming add-on",
};

const zar = (n: number) =>
  new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(n ?? 0);

export default function PriceIncreasePage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();

  const [percent, setPercent] = useState(10);
  const [roundTo, setRoundTo] = useState(1);
  const [targets, setTargets] = useState<string[]>(TARGETS.map((t) => t.value));
  const [preview, setPreview] = useState<Preview | null>(null);

  const run = useMutation({
    mutationFn: async (dryRun: boolean) => {
      const { data, error } = await supabase.rpc("apply_price_increase" as any, {
        p_tenant_id: tenantId,
        p_percent: percent,
        p_targets: targets,
        p_round_to: roundTo,
        p_dry_run: dryRun,
      });
      if (error) throw error;
      return data as unknown as Preview;
    },
    onSuccess: (data, dryRun) => {
      setPreview(data);
      if (!dryRun) toast.success(`${data.count} price${data.count === 1 ? "" : "s"} updated`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not run the increase"),
  });

  function toggle(v: string) {
    setPreview(null);
    setTargets((t) => (t.includes(v) ? t.filter((x) => x !== v) : [...t, v]));
  }

  async function apply() {
    const ok = await confirm({
      title: `Increase ${preview?.count ?? 0} prices by ${percent}%?`,
      description: "This writes the new prices to the rate cards. Existing invoices are not touched.",
      confirmLabel: "Apply increase",
    });
    if (ok) run.mutate(false);
  }

  return (
    <>
      <AppHeader
        title="Annual price increase"
        subtitle="Lift every rate card by a percentage. Preview first, then apply."
      />
      <div className="flex-1 p-4 sm:p-6">
        <div className="sk-card max-w-3xl space-y-6 p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Increase</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="0.5"
                  min={0}
                  value={percent}
                  onChange={(e) => {
                    setPercent(Number(e.target.value));
                    setPreview(null);
                  }}
                  className="w-32 rounded-md border px-3 py-2"
                />
                <span className="text-xs text-muted-foreground">%</span>
              </div>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Round to nearest</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  step="1"
                  min={0.01}
                  value={roundTo}
                  onChange={(e) => {
                    setRoundTo(Number(e.target.value));
                    setPreview(null);
                  }}
                  className="w-32 rounded-md border px-3 py-2"
                />
                <span className="text-xs text-muted-foreground">ZAR</span>
              </div>
            </label>
          </div>

          <div>
            <div className="text-sm font-medium">Apply to</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {TARGETS.map((t) => {
                const on = targets.includes(t.value);
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => toggle(t.value)}
                    className={
                      "rounded-full border px-3 py-1 text-xs font-medium " +
                      (on ? "border-sk-coral bg-sk-coral text-white" : "border-border bg-white hover:bg-muted")
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="sk-btn sk-btn-primary"
              disabled={run.isPending || targets.length === 0}
              onClick={() => run.mutate(true)}
            >
              <TrendingUp className="mr-2 h-4 w-4" />
              {run.isPending ? "Working…" : "Preview"}
            </button>
            {preview && preview.dry_run && preview.count > 0 && (
              <button type="button" className="sk-btn" disabled={run.isPending} onClick={apply}>
                <Check className="mr-2 h-4 w-4" /> Apply to {preview.count} prices
              </button>
            )}
          </div>

          {preview && (
            <div className="overflow-hidden rounded-xl border border-border">
              <div className="border-b border-border bg-muted/40 px-4 py-2 text-xs font-medium text-muted-foreground">
                {preview.dry_run ? "Preview" : "Applied"} · {preview.count} item{preview.count === 1 ? "" : "s"}
              </div>
              {preview.rows.length === 0 && (
                <div className="p-6 text-sm text-muted-foreground">Nothing to change.</div>
              )}
              {preview.rows.map((r) => (
                <div key={`${r.table}-${r.id}`} className="flex items-center gap-3 border-b border-border px-4 py-2 text-sm last:border-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{TABLE_LABELS[r.table] ?? r.table}</div>
                  </div>
                  <div className="text-xs text-muted-foreground line-through">{zar(r.old_price)}</div>
                  <div className="font-semibold">{zar(r.new_price)}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
