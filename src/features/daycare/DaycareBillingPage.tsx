import { useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ChevronLeft, ChevronRight, Play, Search, CheckCircle2, Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useInvoicingSettings } from "@/features/invoices/queries";
import { supabase } from "@/integrations/supabase/client";
import { emailIssuedInvoice } from "@/features/invoices/autoEmail";

export const RUN_PERMISSION = "invoicing.run_monthly";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const fmt = (y: number, m: number, d: number) => `${pad(d)} ${MONTHS[m]} ${y}`;
const zar = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

interface Row { enrolment_id: string; customer_id: string; customer_name: string | null; customer_email: string | null; pet_name: string | null; plan_name: string | null; end_date: string | null; amount: number }
interface Summary { customers: number; lines: number; total: number; gross_total: number; hotel_credit_lines: number; hotel_credit_total: number }

export function daycareTabs(navigate: (p: string) => void, active: string, canBill: boolean) {
  const t = [
    { label: "Board", path: "/admin/daycare" },
    { label: "Enrolments", path: "/admin/daycare/enrolments" },
    { label: "Attendance", path: "/admin/daycare/attendance" },
  ];
  if (canBill) t.push({ label: "Monthly billing", path: "/admin/daycare/billing" });
  return t.map((x) => (x.label === active ? { label: x.label, active: true } : { label: x.label, onClick: () => navigate(x.path) }));
}

type Stage = "review" | "confirm" | "creating" | "emailing" | "done";

export default function DaycareBillingPage() {
  const navigate = useNavigate();
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canRun = hasPermission(RUN_PERMISSION);
  const settingsQ = useInvoicingSettings(tenantId);
  const runDay = Number((settingsQ.data as any)?.billing_run_day ?? 20);
  const dueDay = Number((settingsQ.data as any)?.billing_due_day ?? 1);

  const now = new Date();
  const [ym, setYm] = useState(() => ({ y: now.getMonth() === 11 ? now.getFullYear() + 1 : now.getFullYear(), m: (now.getMonth() + 1) % 12 }));
  const shift = (d: number) => { setYm(({ y, m }) => { const t = y * 12 + m + d; return { y: Math.floor(t / 12), m: t % 12 }; }); setSummary(null); setRows([]); };
  const periodStart = iso(ym.y, ym.m, 1);
  const lastDay = new Date(ym.y, ym.m + 1, 0).getDate();
  const prev = ym.m === 0 ? { y: ym.y - 1, m: 11 } : { y: ym.y, m: ym.m - 1 };
  const runDate = fmt(prev.y, prev.m, Math.min(runDay, new Date(prev.y, prev.m + 1, 0).getDate()));
  const dueDate = fmt(ym.y, ym.m, Math.min(dueDay, lastDay));

  const [loading, setLoading] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [stage, setStage] = useState<Stage | null>(null);
  const [emailNow, setEmailNow] = useState(true);
  const [ack, setAck] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, sent: 0, failed: 0 });
  const [result, setResult] = useState<{ invoices: number; issued: number } | null>(null);

  async function loadPreview() {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [s, b] = await Promise.all([
        supabase.rpc("generate_monthly_daycare_invoices" as any, { p_tenant_id: tenantId, p_period_start: periodStart, p_preview: true, p_issue: false }),
        supabase.rpc("preview_monthly_daycare_breakdown" as any, { p_tenant_id: tenantId, p_period_start: periodStart }),
      ]);
      if (s.error) throw s.error;
      if (b.error) throw b.error;
      const r: any = s.data ?? {};
      setSummary({
        customers: Number(r.customers ?? 0), lines: Number(r.lines ?? 0), total: Number(r.total ?? 0),
        gross_total: Number(r.gross_total ?? r.total ?? 0), hotel_credit_lines: Number(r.hotel_credit_lines ?? 0),
        hotel_credit_total: Number(r.hotel_credit_total ?? 0),
      });
      setRows(((b.data ?? []) as any[]).map((x) => ({ ...x, amount: Number(x.amount ?? 0) })));
    } catch (e: any) {
      toast.error(e?.message ?? "Preview failed");
    } finally { setLoading(false); }
  }

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, { name: string; email: string | null; items: Row[]; total: number }>();
    for (const r of rows) {
      const g = map.get(r.customer_id) ?? { name: r.customer_name ?? "—", email: r.customer_email, items: [], total: 0 };
      g.items.push(r); g.total += r.amount; map.set(r.customer_id, g);
    }
    return [...map.values()].filter((g) => !q || g.name.toLowerCase().includes(q) || g.items.some((i) => (i.pet_name ?? "").toLowerCase().includes(q)));
  }, [rows, search]);
  const noEmail = useMemo(() => new Set(rows.filter((r) => !r.customer_email).map((r) => r.customer_id)).size, [rows]);
  const leaving = rows.filter((r) => r.end_date).length;

  async function run() {
    if (!tenantId) return;
    setStage("creating");
    try {
      const { data, error } = await supabase.rpc("generate_monthly_daycare_invoices" as any, {
        p_tenant_id: tenantId, p_period_start: periodStart, p_preview: false, p_issue: true,
      });
      if (error) throw error;
      const r: any = data ?? {};
      const ids: string[] = Array.isArray(r.invoice_ids) ? r.invoice_ids : [];
      setResult({ invoices: Number(r.invoices ?? 0), issued: Number(r.issued ?? 0) });
      if (emailNow && ids.length) {
        setStage("emailing");
        let sent = 0, failed = 0;
        setProgress({ done: 0, total: ids.length, sent: 0, failed: 0 });
        for (let i = 0; i < ids.length; i++) {
          try { if (await emailIssuedInvoice(ids[i])) sent++; } catch { failed++; }
          setProgress({ done: i + 1, total: ids.length, sent, failed });
          await new Promise((res) => setTimeout(res, 400)); // gentle pace for the mail server
        }
      }
      setStage("done");
    } catch (e: any) {
      toast.error(e?.message ?? "Billing run failed");
      setStage("review");
    }
  }

  const closeModal = () => { if (stage === "creating" || stage === "emailing") return; if (stage === "done") { setSummary(null); setRows([]); } setStage(null); setAck(false); };
  const label = `${LONG[ym.m]} ${ym.y}`;

  if (!canRun) {
    return (
      <>
        <AppHeader title="Daycare" tabs={daycareTabs(navigate, "Monthly billing", false)} />
        <div className="p-6 text-sm text-muted-foreground">Monthly billing is only available to admins with the "Run monthly billing" permission.</div>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Daycare" subtitle="Monthly prepaid daycare invoicing." tabs={daycareTabs(navigate, "Monthly billing", true)} />
      <div className="mx-auto max-w-5xl space-y-5 p-4 sm:p-6">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-sm text-muted-foreground">
            Daycare is billed in advance. On the {runDay}th of each month you bill the <strong>coming</strong> month. Pick the month, check the list, then run.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex items-center rounded-lg border border-border">
              <button onClick={() => shift(-1)} className="grid h-10 w-10 place-items-center hover:bg-muted" aria-label="Previous month"><ChevronLeft className="h-4 w-4" /></button>
              <div className="min-w-[160px] px-3 text-center text-base font-semibold">{label}</div>
              <button onClick={() => shift(1)} className="grid h-10 w-10 place-items-center hover:bg-muted" aria-label="Next month"><ChevronRight className="h-4 w-4" /></button>
            </div>
            <button onClick={loadPreview} disabled={loading}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark disabled:opacity-50">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />} Preview {label}
            </button>
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-muted px-2.5 py-1">Covers {fmt(ym.y, ym.m, 1)} – {fmt(ym.y, ym.m, lastDay)}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">Normal run day: {runDate}</span>
            <span className="rounded-full bg-muted px-2.5 py-1">Payment due: {dueDate}</span>
          </div>
        </div>

        {summary && (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kpi label="Customers" value={String(summary.customers)} />
              <Kpi label="Dogs / enrolments" value={String(summary.lines)} />
              <Kpi label="Hotel-stay credits" value={summary.hotel_credit_lines ? `−${zar(summary.hotel_credit_total)}` : "None"} />
              <Kpi label="Total to invoice" value={zar(summary.total)} strong />
            </div>

            {summary.lines === 0 ? (
              <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
                Nothing to bill for {label} — it may already have been billed.
              </div>
            ) : (
              <div className="rounded-xl border border-border bg-card">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search owner or dog"
                      className="h-10 w-64 rounded-lg border border-border bg-background pl-9 pr-3 text-sm" />
                  </div>
                  <button onClick={() => setStage("review")}
                    className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark">
                    <Play className="h-4 w-4" /> Start billing run…
                  </button>
                </div>
                <div className="max-h-[520px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-muted text-left text-xs text-muted-foreground">
                      <tr><th className="px-4 py-2">Owner</th><th className="px-4 py-2">Dog</th><th className="px-4 py-2">Plan</th><th className="px-4 py-2 text-right">Amount</th></tr>
                    </thead>
                    <tbody>
                      {grouped.map((g) => g.items.map((i, idx) => (
                        <tr key={i.enrolment_id} className={idx === 0 ? "border-t border-border" : ""}>
                          <td className="px-4 py-2 align-top">
                            {idx === 0 && <><div className="font-medium">{g.name}</div>{!g.email && <div className="text-xs text-destructive">No email on file</div>}</>}
                          </td>
                          <td className="px-4 py-2">{i.pet_name ?? "—"}</td>
                          <td className="px-4 py-2">{i.plan_name ?? "—"}{i.end_date && <span className="ml-2 rounded bg-sk-orange-soft px-1.5 py-0.5 text-[10px] font-semibold">Leaving {i.end_date}</span>}</td>
                          <td className="px-4 py-2 text-right tabular-nums">{zar(i.amount)}</td>
                        </tr>
                      )))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {stage && summary && (
        <ModalShell title={stage === "done" ? "Billing run complete" : `Bill ${label}`} onClose={closeModal} closeOnEscape={stage !== "creating" && stage !== "emailing"}
          footer={
            stage === "review" ? (
              <div className="flex justify-end gap-2">
                <button onClick={closeModal} className="h-10 rounded-lg border border-border bg-card px-4 text-sm">Back</button>
                <button onClick={() => setStage("confirm")} className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark">Looks right — continue</button>
              </div>
            ) : stage === "confirm" ? (
              <div className="flex justify-end gap-2">
                <button onClick={() => { setStage("review"); setAck(false); }} className="h-10 rounded-lg border border-border bg-card px-4 text-sm">Back</button>
                <button disabled={!ack} onClick={run} className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark disabled:opacity-50">Yes, create {summary.customers} invoices</button>
              </div>
            ) : stage === "done" ? (
              <div className="flex justify-end gap-2">
                <button onClick={closeModal} className="h-10 rounded-lg border border-border bg-card px-4 text-sm">Close</button>
                <button onClick={() => navigate(`/admin/invoices?period=${ym.y}-${pad(ym.m + 1)}`)} className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-primary-foreground hover:bg-sk-coral-dark">View invoices</button>
              </div>
            ) : undefined
          }>
          <div className="space-y-4 p-6 text-sm">
            {stage === "review" && (
              <>
                <p><strong>Step 1 of 2 — check the list.</strong> This will bill <strong>{summary.customers}</strong> customers for <strong>{summary.lines}</strong> dogs, totalling <strong>{zar(summary.total)}</strong>.</p>
                <ul className="space-y-1 text-muted-foreground">
                  {summary.hotel_credit_lines > 0 && <li>• {summary.hotel_credit_lines} hotel-stay credit(s) of {zar(summary.hotel_credit_total)} will be deducted.</li>}
                  {leaving > 0 && <li>• {leaving} dog(s) are leaving this month and are charged pro-rata.</li>}
                  {noEmail > 0 && <li className="text-destructive">• {noEmail} customer(s) have no email address — their invoices will be created but not emailed.</li>}
                </ul>
                <div className="max-h-72 overflow-y-auto rounded-lg border border-border">
                  {grouped.map((g) => (
                    <div key={g.name + g.total} className="flex justify-between border-b border-border px-3 py-1.5 last:border-0">
                      <span>{g.name} <span className="text-muted-foreground">· {g.items.map((i) => i.pet_name).join(", ")}</span></span>
                      <span className="tabular-nums">{zar(g.total)}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
            {stage === "confirm" && (
              <>
                <p><strong>Step 2 of 2 — final check.</strong> Invoices can't be deleted once created; mistakes need a credit note.</p>
                <label className="flex items-center gap-2"><input type="checkbox" checked={emailNow} onChange={(e) => setEmailNow(e.target.checked)} /> Email the invoices to customers now</label>
                <label className="flex items-start gap-2 rounded-lg border border-border bg-muted p-3">
                  <input type="checkbox" className="mt-0.5" checked={ack} onChange={(e) => setAck(e.target.checked)} />
                  <span>I've checked the list — create {summary.customers} invoices for {label} totalling {zar(summary.total)}.</span>
                </label>
              </>
            )}
            {(stage === "creating" || stage === "emailing") && createPortal(null, document.body)}
            {(stage === "creating" || stage === "emailing") && (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-lg bg-sk-orange-soft p-3 text-xs font-medium"><AlertTriangle className="h-4 w-4" /> Please keep this window open until it finishes.</div>
                <Step done={stage === "emailing"} active={stage === "creating"} text="Creating invoices and applying credits" />
                {emailNow && <Step done={false} active={stage === "emailing"} text={stage === "emailing" ? `Sending emails… ${progress.done} of ${progress.total}` : "Sending emails"} />}
                {stage === "emailing" && (
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-sk-coral transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />
                  </div>
                )}
              </div>
            )}
            {stage === "done" && result && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-base font-semibold"><CheckCircle2 className="h-5 w-5 text-sk-green" /> {label} is billed</div>
                <p>{result.invoices} invoice(s) created · {result.issued} issued{emailNow ? ` · ${progress.sent} emailed` : " · not emailed"}.</p>
                {emailNow && progress.total - progress.sent > 0 && (
                  <p className="text-muted-foreground">{progress.total - progress.sent} weren't emailed (no email address, zero total, or a send error). You can send them from the Invoices page.</p>
                )}
              </div>
            )}
          </div>
        </ModalShell>
      )}
    </>
  );
}

function Kpi({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 tabular-nums ${strong ? "text-xl font-bold" : "text-lg font-semibold"}`}>{value}</div>
    </div>
  );
}

function Step({ done, active, text }: { done: boolean; active: boolean; text: string }) {
  return (
    <div className="flex items-center gap-2">
      {done ? <CheckCircle2 className="h-4 w-4 text-sk-green" /> : active ? <Loader2 className="h-4 w-4 animate-spin" /> : <span className="h-4 w-4 rounded-full border border-border" />}
      <span className={active ? "font-medium" : "text-muted-foreground"}>{text}</span>
    </div>
  );
}
