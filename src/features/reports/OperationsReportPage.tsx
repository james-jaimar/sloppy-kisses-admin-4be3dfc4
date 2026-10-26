import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";

type GroupBy = "day" | "month";

interface BookingRow {
  id: string;
  service_type: string;
  start_at: string | null;
  end_at: string | null;
  status: string;
  resource_name: string | null;
}

const COLS = [
  { key: "daycare", label: "Daycare" },
  { key: "grooming_inhouse", label: "Grooming (in-house)" },
  { key: "grooming_mobile", label: "Mobile grooming" },
  { key: "hotel_in", label: "Hotel check-ins" },
  { key: "hotel_out", label: "Hotel check-outs" },
  { key: "pickup_dropoff", label: "Transport" },
] as const;

type ColKey = (typeof COLS)[number]["key"];

function isoDay(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function bucketKey(iso: string, groupBy: GroupBy) {
  return groupBy === "day" ? iso.slice(0, 10) : iso.slice(0, 7);
}

function bucketLabel(key: string, groupBy: GroupBy) {
  if (groupBy === "month") {
    return new Date(`${key}-02T00:00:00`).toLocaleDateString("en-ZA", { month: "long", year: "numeric" });
  }
  return new Date(`${key}T12:00:00`).toLocaleDateString("en-ZA", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export default function OperationsReportPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [from, setFrom] = useState(() => {
    const d = new Date();
    d.setDate(1);
    return isoDay(d);
  });
  const [to, setTo] = useState(() => isoDay(new Date()));
  const [groupBy, setGroupBy] = useState<GroupBy>("day");

  const q = useQuery({
    enabled: !!tenantId && !!supabase,
    queryKey: ["reports", "operations", tenantId, from, to],
    queryFn: async (): Promise<BookingRow[]> => {
      // Include hotel stays that end inside the range too, so check-outs show.
      const { data, error } = await supabase!
        .from("bookings")
        .select("id, service_type, start_at, end_at, status, resource:resources(name)")
        .eq("tenant_id", tenantId!)
        .not("status", "in", "(cancelled,no_show)")
        .or(
          `and(start_at.gte.${from}T00:00:00,start_at.lte.${to}T23:59:59),` +
            `and(service_type.in.(hotel_dog,hotel_cat),end_at.gte.${from}T00:00:00,end_at.lte.${to}T23:59:59)`,
        )
        .order("start_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id,
        service_type: r.service_type,
        start_at: r.start_at,
        end_at: r.end_at,
        status: r.status,
        resource_name: r.resource?.name ?? null,
      }));
    },
  });

  const rows = useMemo(() => {
    const buckets = new Map<string, Record<ColKey, number>>();
    const bump = (key: string, col: ColKey) => {
      const b = buckets.get(key) ?? {
        daycare: 0,
        grooming_inhouse: 0,
        grooming_mobile: 0,
        hotel_in: 0,
        hotel_out: 0,
        pickup_dropoff: 0,
      };
      b[col] += 1;
      buckets.set(key, b);
    };
    for (const b of q.data ?? []) {
      if (b.start_at) {
        const key = bucketKey(b.start_at, groupBy);
        if (b.service_type === "hotel_dog" || b.service_type === "hotel_cat") bump(key, "hotel_in");
        else if (COLS.some((c) => c.key === b.service_type)) bump(key, b.service_type as ColKey);
      }
      if (
        (b.service_type === "hotel_dog" || b.service_type === "hotel_cat") &&
        b.end_at &&
        bucketKey(b.end_at, groupBy) !== (b.start_at ? bucketKey(b.start_at, groupBy) : null)
      ) {
        bump(bucketKey(b.end_at, groupBy), "hotel_out");
      }
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, counts]) => ({
        key,
        label: bucketLabel(key, groupBy),
        counts,
        total: COLS.reduce((sum, c) => sum + counts[c.key], 0),
      }));
  }, [q.data, groupBy]);

  const vanRows = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of q.data ?? []) {
      if (b.service_type !== "grooming_mobile" || !b.start_at) continue;
      const name = b.resource_name ?? "Unassigned";
      m.set(name, (m.get(name) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [q.data]);

  const totals = useMemo(() => {
    const t: Record<ColKey, number> = {
      daycare: 0,
      grooming_inhouse: 0,
      grooming_mobile: 0,
      hotel_in: 0,
      hotel_out: 0,
      pickup_dropoff: 0,
    };
    for (const r of rows) for (const c of COLS) t[c.key] += r.counts[c.key];
    return t;
  }, [rows]);

  function downloadCsv() {
    const header = ["Period", ...COLS.map((c) => c.label), "Total"];
    const lines = rows.map((r) =>
      [r.label, ...COLS.map((c) => r.counts[c.key]), r.total].join(","),
    );
    const csv = [header.join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `operations-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const inputCls = "h-10 rounded-xl border border-border bg-white px-3 text-sm";

  return (
    <>
      <AppHeader
        title="Operations volume"
        subtitle="How many pets per service, per day or month"
        actions={
          <button
            onClick={downloadCsv}
            disabled={!rows.length}
            className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> CSV
          </button>
        }
      />
      <div className="mx-auto w-full max-w-6xl space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => e.target.value && setFrom(e.target.value)} className={inputCls} />
          <span className="text-sm text-muted-foreground">to</span>
          <input type="date" value={to} onChange={(e) => e.target.value && setTo(e.target.value)} className={inputCls} />
          <div className="ml-auto flex gap-1 rounded-xl border border-border p-1">
            {(["day", "month"] as GroupBy[]).map((g) => (
              <button
                key={g}
                onClick={() => setGroupBy(g)}
                className={
                  "rounded-lg px-3 py-1.5 text-sm font-medium " +
                  (groupBy === g ? "bg-sk-coral text-white" : "text-muted-foreground hover:bg-muted")
                }
              >
                Per {g}
              </button>
            ))}
          </div>
        </div>

        <div className="sk-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-3">{groupBy === "day" ? "Day" : "Month"}</th>
                {COLS.map((c) => (
                  <th key={c.key} className="px-4 py-3 text-right">{c.label}</th>
                ))}
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {q.isLoading && (
                <tr>
                  <td colSpan={COLS.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                    Loading…
                  </td>
                </tr>
              )}
              {!q.isLoading && !rows.length && (
                <tr>
                  <td colSpan={COLS.length + 2} className="px-4 py-8 text-center text-muted-foreground">
                    No bookings in this period.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.key} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-2 font-medium">{r.label}</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-4 py-2 text-right tabular-nums">
                      {r.counts[c.key] || ""}
                    </td>
                  ))}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-semibold">
                  <td className="px-4 py-2">Total</td>
                  {COLS.map((c) => (
                    <td key={c.key} className="px-4 py-2 text-right tabular-nums">{totals[c.key]}</td>
                  ))}
                  <td className="px-4 py-2 text-right tabular-nums">
                    {COLS.reduce((s, c) => s + totals[c.key], 0)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {vanRows.length > 0 && (
          <div className="sk-card p-4">
            <div className="mb-2 text-sm font-semibold">Mobile grooming per van (whole period)</div>
            <div className="flex flex-wrap gap-3">
              {vanRows.map(([name, count]) => (
                <div key={name} className="rounded-xl border border-border px-4 py-2 text-sm">
                  <span className="font-medium">{name}</span>
                  <span className="ml-2 tabular-nums text-muted-foreground">{count} booking{count === 1 ? "" : "s"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
