import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, AlertCircle, XCircle, Search, UserPlus, Loader2, PlayCircle, ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/lib/supabase/client";
import { useDaycarePlans, useTenantPetsWithOwners, WEEKDAY_LABEL, type Weekday } from "@/features/daycare/queries";
import { toast } from "@/hooks/use-toast";
import { ModalShell } from "@/components/modals/ModalShell";
import seedData from "./daycareRegisterSeed.json";

type SeedRow = {
  row: number;
  owner_raw: string | null;
  owner_first: string | null;
  owner_last: string | null;
  owner_mobile: string | null;
  dog_first: string | null;
  dog_surname: string | null;
  dog_full_name: string | null;
  breed: string | null;
  size: string | null;
  sex: string | null;
  days_per_week: number | null;
  pattern: string[];
  dates: string[];
};

type PetOwner = {
  id: string;
  name: string | null;
  species: string | null;
  customer_id: string;
  customer: {
    id: string;
    full_name: string | null;
    first_name: string | null;
    last_name: string | null;
    mobile: string | null;
    phone_alt: string | null;
  } | null;
};

type RowStatus = "auto" | "review" | "unmatched" | "confirmed" | "skip" | "new";

type RowState = {
  seed: SeedRow;
  status: RowStatus;
  matched_pet_id: string | null;
  matched_customer_id: string | null;
  new_first_name?: string;
  new_last_name?: string;
};

const norm = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const mobileTail = (s: string | null | undefined) => {
  const d = digits(s);
  if (!d) return "";
  return d.slice(-9);
};

function scoreRow(seed: SeedRow, pets: PetOwner[]) {
  const dogFirst = norm(seed.dog_first);
  const ownFirst = norm(seed.owner_first);
  const ownLast = norm(seed.owner_last);
  const seedMobTail = mobileTail(seed.owner_mobile);
  const scored = pets.map((p) => {
    const petName = norm(p.name);
    const ownerFirst = norm(p.customer?.first_name);
    const ownerLast = norm(p.customer?.last_name);
    let s = 0;
    let mobileHit = false;
    let lastHit = false;
    let firstHit = false;
    let dogHit: "exact" | "prefix" | false = false;
    // Mobile: strongest signal
    if (seedMobTail && seedMobTail.length >= 9) {
      const custMob = mobileTail(p.customer?.mobile) || mobileTail(p.customer?.phone_alt);
      if (custMob && custMob === seedMobTail) { s += 80; mobileHit = true; }
    }
    // Dog first name
    if (petName && dogFirst) {
      if (petName === dogFirst) { s += 50; dogHit = "exact"; }
      else if (petName.startsWith(dogFirst) || dogFirst.startsWith(petName)) { s += 20; dogHit = "prefix"; }
    }
    // Owner surname (exact only — Charlotte's sheet had dog names in owner col, so
    // substring matches produce false positives).
    if (ownLast) {
      if (ownerLast && ownerLast === ownLast) { s += 40; lastHit = true; }
    }
    // Owner first name (exact only)
    if (ownFirst) {
      if (ownerFirst && ownerFirst === ownFirst) { s += 25; firstHit = true; }
    }
    return { pet: p, s, mobileHit, lastHit, firstHit, dogHit };
  }).filter((x) => x.s > 0).sort((a, b) => b.s - a.s);
  return scored;
}

export default function DaycareImportPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const navigate = useNavigate();
  const qc = useQueryClient();

  const petsQ = useTenantPetsWithOwners(tenantId);
  const plansQ = useDaycarePlans(tenantId, { activeOnly: true });
  const pets = (petsQ.data ?? []) as PetOwner[];

  const [rows, setRows] = useState<RowState[] | null>(null);
  const [filter, setFilter] = useState<"all" | RowStatus>("all");
  const [committing, setCommitting] = useState(false);
  const [commitResult, setCommitResult] = useState<{ enrolments: number; invoices: number; skipped: number; errors: string[] } | null>(null);

  // Compute initial matches when pets load
  const initialRows = useMemo<RowState[]>(() => {
    if (!pets.length) return (seedData as SeedRow[]).map((s) => ({ seed: s, status: "unmatched" as RowStatus, matched_pet_id: null, matched_customer_id: null }));
    return (seedData as SeedRow[]).map((s) => {
      const cands = scoreRow(s, pets);
      if (cands.length === 0) return { seed: s, status: "unmatched" as RowStatus, matched_pet_id: null, matched_customer_id: null };
      const top = cands[0];
      // Strict auto-match: mobile match, OR owner first+last both exact plus dog name match.
      const isAuto =
        top.mobileHit ||
        (top.firstHit && top.lastHit && (top.dogHit === "exact" || top.dogHit === "prefix"));
      return {
        seed: s,
        status: isAuto ? ("auto" as RowStatus) : ("review" as RowStatus),
        matched_pet_id: top.pet.id,
        matched_customer_id: top.pet.customer_id,
      };
    });
  }, [pets]);

  const effectiveRows = rows ?? initialRows;

  const counts = useMemo(() => {
    const c: Record<RowStatus, number> = { auto: 0, review: 0, unmatched: 0, confirmed: 0, skip: 0, new: 0 };
    effectiveRows.forEach((r) => { c[r.status] = (c[r.status] || 0) + 1; });
    return c;
  }, [effectiveRows]);

  const filtered = filter === "all" ? effectiveRows : effectiveRows.filter((r) => r.status === filter);

  function updateRow(idx: number, patch: Partial<RowState>) {
    const base = rows ?? initialRows.slice();
    const next = base.slice();
    next[idx] = { ...next[idx], ...patch };
    setRows(next);
  }

  function acceptAllAuto() {
    const base = (rows ?? initialRows).map((r) => r.status === "auto" ? { ...r, status: "confirmed" as RowStatus } : r);
    setRows(base);
  }

  const commitMutation = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("No tenant");
      const plans = plansQ.data ?? [];
      const monthPlans = plans.filter((p) => p.billing_period === "month" && p.days_per_week != null);
      const planByDpw = new Map<number, typeof plans[0]>();
      monthPlans.forEach((p) => { if (p.days_per_week != null) planByDpw.set(p.days_per_week, p); });

      let enrolmentsCreated = 0;
      let attendanceCreated = 0;
      let skipped = 0;
      const errors: string[] = [];
      const invoiceLinesByCustomer = new Map<string, { pet_id: string; pet_name: string; plan_name: string; price: number }[]>();

      for (const r of effectiveRows) {
        if (r.status === "skip") { skipped += 1; continue; }
        if (r.status !== "confirmed" && r.status !== "new") { skipped += 1; continue; }

        let petId = r.matched_pet_id;
        let custId = r.matched_customer_id;

        // Create new customer + pet if needed
        if (r.status === "new") {
          try {
            const { data: cn } = await supabase.rpc("next_customer_number", { target_tenant_id: tenantId });
            const first_name = r.new_first_name?.trim() || r.seed.owner_first || "";
            const last_name = r.new_last_name?.trim() || r.seed.owner_last || "";
            const full_name = [first_name, last_name].filter(Boolean).join(" ").trim() || r.seed.owner_raw || "Unnamed";
            const { data: cust, error: cErr } = await supabase.from("customers")
              .insert({
                tenant_id: tenantId, customer_number: cn as string, full_name,
                first_name: first_name || null, last_name: last_name || null,
                mobile: r.seed.owner_mobile || null,
              } as any)
              .select("id").single();
            if (cErr) throw cErr;
            custId = cust.id;
            const { data: pn } = await supabase.rpc("next_pet_number", { target_tenant_id: tenantId });
            const { data: pet, error: pErr } = await supabase.from("pets")
              .insert({
                tenant_id: tenantId, customer_id: custId, pet_number: pn as string,
                name: r.seed.dog_first, species: "dog",
                breed: r.seed.breed, size: r.seed.size,
                sex: r.seed.sex ? r.seed.sex.toLowerCase() : null,
              } as any)
              .select("id").single();
            if (pErr) throw pErr;
            petId = pet.id;
          } catch (e: any) {
            errors.push(`${r.seed.dog_full_name}: create failed — ${e.message ?? e}`);
            continue;
          }
        }

        if (!petId || !custId) { skipped += 1; continue; }
        const dpw = r.seed.days_per_week ?? r.seed.pattern.length;
        const plan = planByDpw.get(dpw) ?? null;

        // Enrolment: skip if active exists
        const { data: existing } = await supabase.from("daycare_enrolments")
          .select("id").eq("tenant_id", tenantId).eq("pet_id", petId).eq("active", true).maybeSingle();
        if (!existing) {
          const { error: eErr } = await supabase.from("daycare_enrolments").insert({
            tenant_id: tenantId,
            pet_id: petId, customer_id: custId,
            daycare_plan_id: plan?.id ?? null,
            start_date: "2026-07-01",
            selected_days: r.seed.pattern,
            active: true,
            notes: "Imported from weekly register 30 June",
          } as any);
          if (eErr) { errors.push(`${r.seed.dog_full_name}: enrolment — ${eErr.message}`); continue; }
          enrolmentsCreated += 1;
        }

        // Attendance rows for every date in the sheet (idempotent)
        if (r.seed.dates.length > 0) {
          const { data: existingAtt } = await supabase.from("daycare_attendance")
            .select("attendance_date")
            .eq("tenant_id", tenantId).eq("pet_id", petId)
            .in("attendance_date", r.seed.dates);
          const have = new Set((existingAtt ?? []).map((x: any) => x.attendance_date));
          const toInsert = r.seed.dates.filter((d) => !have.has(d)).map((d) => ({
            tenant_id: tenantId, pet_id: petId, customer_id: custId,
            attendance_date: d, expected: true, status: "expected",
          }));
          if (toInsert.length > 0) {
            const { error: aErr } = await supabase.from("daycare_attendance").insert(toInsert as any);
            if (aErr) errors.push(`${r.seed.dog_full_name}: attendance — ${aErr.message}`);
            else attendanceCreated += toInsert.length;
          }
        }

        // Queue invoice line
        if (plan && plan.price) {
          const list = invoiceLinesByCustomer.get(custId) ?? [];
          list.push({
            pet_id: petId,
            pet_name: r.seed.dog_first ?? r.seed.dog_full_name ?? "Dog",
            plan_name: plan.name,
            price: Number(plan.price),
          });
          invoiceLinesByCustomer.set(custId, list);
        }
      }

      // Create July 2026 invoices per customer
      let invoicesCreated = 0;
      for (const [customerId, lines] of invoiceLinesByCustomer.entries()) {
        try {
          const { data: num, error: nErr } = await supabase.rpc("next_invoice_number", { target_tenant_id: tenantId });
          if (nErr) throw nErr;
          const { data: inv, error: iErr } = await supabase.from("invoices").insert({
            tenant_id: tenantId,
            customer_id: customerId,
            invoice_number: num as string,
            status: "draft",
            issue_date: "2026-07-01",
            due_date: "2026-07-31",
            notes: "Daycare — July 2026 (imported from weekly register)",
          } as any).select("id").single();
          if (iErr) throw iErr;

          const items = lines.map((ln, idx) => ({
            tenant_id: tenantId,
            invoice_id: inv.id,
            description: `Daycare — ${ln.pet_name} — ${ln.plan_name}`,
            quantity: 1,
            unit_price: ln.price,
            line_total: ln.price,
            sort_order: idx,
          }));
          const { error: itErr } = await supabase.from("invoice_items").insert(items as any);
          if (itErr) throw itErr;

          const subtotal = lines.reduce((s, l) => s + l.price, 0);
          await supabase.from("invoices").update({
            subtotal, total: subtotal, balance_due: subtotal, amount_paid: 0,
          } as any).eq("id", inv.id).eq("tenant_id", tenantId);
          invoicesCreated += 1;
        } catch (e: any) {
          errors.push(`Invoice for customer ${customerId}: ${e.message ?? e}`);
        }
      }

      return { enrolments: enrolmentsCreated, attendance: attendanceCreated, invoices: invoicesCreated, skipped, errors };
    },
    onSuccess: (res) => {
      setCommitResult(res);
      setCommitting(false);
      qc.invalidateQueries({ queryKey: ["daycare_enrolments"] });
      qc.invalidateQueries({ queryKey: ["daycare_attendance"] });
      qc.invalidateQueries({ queryKey: ["invoices"] });
      toast({ title: "Import complete", description: `${res.enrolments} enrolments, ${res.attendance} attendance rows, ${res.invoices} invoices.` });
    },
    onError: (e: any) => {
      setCommitting(false);
      toast({ title: "Import failed", description: e.message ?? String(e), variant: "destructive" });
    },
  });

  if (petsQ.isLoading || plansQ.isLoading) {
    return (
      <>
        <AppHeader title="Import daycare register" />
        <div className="p-8 text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /> Loading customer &amp; plan data…</div>
      </>
    );
  }

  const readyCount = counts.confirmed + counts.new;
  const totalActionable = effectiveRows.length - counts.skip;

  return (
    <>
      <AppHeader
        title="Import daycare register"
        subtitle="Reconcile the 30 June weekly sheet against the customer & pet database."
        actions={
          <button onClick={() => navigate("/admin/settings")} className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-sk-surface-muted">
            <ArrowLeft className="h-4 w-4" /> Back to settings
          </button>
        }
      />

      <div className="flex-1 space-y-4 p-6">
        {/* Summary */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
          <StatCard label="Total rows" value={effectiveRows.length} tone="neutral" onClick={() => setFilter("all")} active={filter === "all"} />
          <StatCard label="Auto-matched" value={counts.auto} tone="green" onClick={() => setFilter("auto")} active={filter === "auto"} />
          <StatCard label="Confirmed" value={counts.confirmed} tone="blue" onClick={() => setFilter("confirmed")} active={filter === "confirmed"} />
          <StatCard label="Needs review" value={counts.review} tone="amber" onClick={() => setFilter("review")} active={filter === "review"} />
          <StatCard label="Unmatched" value={counts.unmatched} tone="red" onClick={() => setFilter("unmatched")} active={filter === "unmatched"} />
          <StatCard label="Will create new" value={counts.new} tone="purple" onClick={() => setFilter("new")} active={filter === "new"} />
        </div>

        <div className="sk-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="text-sm text-muted-foreground">
            {readyCount} of {totalActionable} ready to commit. Skipped: {counts.skip}.
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={acceptAllAuto}
              disabled={counts.auto === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border px-3 text-sm hover:bg-sk-surface-muted disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4 text-sk-green" /> Accept all auto-matches ({counts.auto})
            </button>
            <button
              onClick={() => { setCommitting(true); commitMutation.mutate(); }}
              disabled={committing || readyCount === 0}
              className="inline-flex h-9 items-center gap-2 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
            >
              {committing ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Commit import ({readyCount}) — create enrolments &amp; July invoices
            </button>
          </div>
        </div>

        {commitResult && (
          <div className="sk-card space-y-2 p-4">
            <div className="font-semibold">Import result</div>
            <div className="text-sm text-muted-foreground">
              Created {commitResult.enrolments} enrolments and {commitResult.invoices} July invoices. Skipped {commitResult.skipped}.
            </div>
            {commitResult.errors.length > 0 && (
              <details className="text-xs">
                <summary className="cursor-pointer text-destructive">{commitResult.errors.length} errors</summary>
                <ul className="ml-4 mt-1 list-disc space-y-0.5">
                  {commitResult.errors.map((e, i) => <li key={i}>{e}</li>)}
                </ul>
              </details>
            )}
          </div>
        )}

        {/* Rows table */}
        <div className="sk-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-sk-surface-muted text-left text-xs font-medium uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Status</th>
                  <th className="px-4 py-2">Dog (sheet)</th>
                  <th className="px-4 py-2">Owner (sheet)</th>
                  <th className="px-4 py-2">Days</th>
                  <th className="px-4 py-2">Match</th>
                  <th className="px-4 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((r) => {
                  const idx = effectiveRows.indexOf(r);
                  return <ReconcileRow key={r.seed.row} idx={idx} row={r} pets={pets} onChange={(patch) => updateRow(idx, patch)} />;
                })}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="px-5 py-10 text-center text-muted-foreground">Nothing in this bucket.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}

function StatCard({ label, value, tone, onClick, active }: { label: string; value: number; tone: "neutral" | "green" | "amber" | "red" | "blue" | "purple"; onClick: () => void; active: boolean }) {
  const tones: Record<string, string> = {
    neutral: "border-border",
    green: "border-sk-green/40 bg-sk-green/5",
    amber: "border-yellow-500/40 bg-yellow-500/5",
    red: "border-destructive/40 bg-destructive/5",
    blue: "border-sk-turquoise/40 bg-sk-turquoise/5",
    purple: "border-purple-400/40 bg-purple-400/5",
  };
  return (
    <button
      onClick={onClick}
      className={`sk-card p-3 text-left transition-all ${tones[tone]} ${active ? "ring-2 ring-sk-coral" : ""}`}
    >
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
    </button>
  );
}

function ReconcileRow({ idx, row, pets, onChange }: { idx: number; row: RowState; pets: PetOwner[]; onChange: (patch: Partial<RowState>) => void }) {
  const [search, setSearch] = useState("");
  const [showPicker, setShowPicker] = useState(false);

  const matched = row.matched_pet_id ? pets.find((p) => p.id === row.matched_pet_id) : null;

  const results = useMemo(() => {
    if (!search.trim()) return [];
    const q = search.trim().toLowerCase();
    return pets.filter((p) => {
      const pn = (p.name ?? "").toLowerCase();
      const on = (p.customer?.full_name ?? "").toLowerCase();
      return pn.includes(q) || on.includes(q);
    }).slice(0, 20);
  }, [search, pets]);

  const statusPill = (() => {
    const map: Record<RowStatus, { text: string; cls: string; icon: any }> = {
      auto: { text: "Auto", cls: "bg-sk-green/10 text-sk-green", icon: CheckCircle2 },
      confirmed: { text: "Confirmed", cls: "bg-sk-turquoise/10 text-sk-turquoise-dark", icon: CheckCircle2 },
      review: { text: "Review", cls: "bg-yellow-500/15 text-yellow-700", icon: AlertCircle },
      unmatched: { text: "Unmatched", cls: "bg-destructive/10 text-destructive", icon: XCircle },
      new: { text: "New", cls: "bg-purple-500/10 text-purple-700", icon: UserPlus },
      skip: { text: "Skipped", cls: "bg-muted text-muted-foreground", icon: XCircle },
    };
    const m = map[row.status];
    const Icon = m.icon;
    return <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${m.cls}`}><Icon className="h-3 w-3" />{m.text}</span>;
  })();

  return (
    <tr className="hover:bg-sk-surface-muted/40 align-top">
      <td className="px-4 py-3">{statusPill}</td>
      <td className="px-4 py-3">
        <div className="font-medium">{row.seed.dog_full_name}</div>
        <div className="text-xs text-muted-foreground">
          {[row.seed.breed, row.seed.size, row.seed.sex].filter(Boolean).join(" · ") || "—"}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="text-xs font-semibold tabular-nums">{row.seed.days_per_week ?? row.seed.pattern.length}× / wk</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {row.seed.pattern.map((d) => (
            <span key={d} className="rounded bg-sk-turquoise-soft px-1.5 py-0.5 text-[10px] font-semibold text-sk-turquoise-dark">
              {WEEKDAY_LABEL[d as Weekday] ?? d}
            </span>
          ))}
          <span className="ml-1 rounded bg-sk-surface-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{row.seed.dates.length} dates</span>
        </div>
      </td>
      <td className="px-4 py-3">
        {row.status === "new" ? (
          <div className="space-y-1">
            <div className="text-xs font-medium text-purple-700">Will create new customer + pet</div>
            <div className="flex gap-2">
              <input
                value={row.new_first_name ?? row.seed.owner_first ?? ""}
                onChange={(e) => onChange({ new_first_name: e.target.value })}
                placeholder="Owner first name"
                className="h-8 w-32 rounded-md border border-border bg-background px-2 text-xs"
              />
              <input
                value={row.new_last_name ?? row.seed.owner_last ?? ""}
                onChange={(e) => onChange({ new_last_name: e.target.value })}
                placeholder="Owner surname"
                className="h-8 w-32 rounded-md border border-border bg-background px-2 text-xs"
              />
            </div>
            <div className="text-[11px] text-muted-foreground">Pet: {row.seed.dog_first} ({row.seed.breed ?? "—"})</div>
          </div>
        ) : matched ? (
          <div>
            <div className="font-medium">{matched.name}</div>
            <div className="text-xs text-muted-foreground">{matched.customer?.full_name ?? "—"}</div>
          </div>
        ) : (
          <div className="text-xs italic text-muted-foreground">No match</div>
        )}

        {showPicker && (
          <div className="mt-2 space-y-1">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-2 h-3.5 w-3.5 text-muted-foreground" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search pet or owner…"
                className="h-8 w-full rounded-md border border-border bg-background pl-7 pr-2 text-xs"
              />
            </div>
            {results.length > 0 && (
              <div className="max-h-48 overflow-auto rounded-md border border-border bg-background">
                {results.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => { onChange({ matched_pet_id: p.id, matched_customer_id: p.customer_id, status: "confirmed" }); setShowPicker(false); setSearch(""); }}
                    className="flex w-full items-center justify-between border-b border-border px-2 py-1 text-left text-xs last:border-b-0 hover:bg-sk-surface-muted"
                  >
                    <span><span className="font-medium">{p.name}</span> <span className="text-muted-foreground">· {p.customer?.full_name}</span></span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex flex-wrap justify-end gap-1">
          {(row.status === "auto" || row.status === "review") && row.matched_pet_id && (
            <button
              onClick={() => onChange({ status: "confirmed" })}
              className="rounded-md border border-sk-green/40 bg-sk-green/10 px-2 py-1 text-xs font-medium text-sk-green hover:bg-sk-green/20"
            >Confirm</button>
          )}
          <button
            onClick={() => setShowPicker((v) => !v)}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-sk-surface-muted"
          >{showPicker ? "Cancel" : "Pick pet"}</button>
          <button
            onClick={() => onChange({ status: "new", matched_pet_id: null, matched_customer_id: null, new_first_name: row.seed.owner_first ?? "", new_last_name: row.seed.owner_last ?? "" })}
            className="rounded-md border border-purple-400/50 bg-purple-50 px-2 py-1 text-xs text-purple-700 hover:bg-purple-100"
          >Create new</button>
          <button
            onClick={() => onChange({ status: "skip" })}
            className="rounded-md border border-border px-2 py-1 text-xs text-muted-foreground hover:bg-sk-surface-muted"
          >Skip</button>
        </div>
      </td>
    </tr>
  );
}