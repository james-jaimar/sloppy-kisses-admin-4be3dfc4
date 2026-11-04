import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { supabase } from "@/integrations/supabase/client";

import { mobileStopKey, saDay, type VolumeBooking } from "./operationCounts";
import { Button } from "@/components/ui/button";

type GroupBy = "day" | "month";

interface BookingRow extends VolumeBooking {
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
  { key: "grooming_mobile", label: "Mobile dogs" },
  { key: "mobile_stops", label: "Mobile stops" },
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
  const day = saDay(iso);
  return groupBy === "day" ? day : day.slice(0, 7);
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
      if (!tenantId) return [];
      const { data, error } = await supabase
        .from("bookings")
        .select("id, service_type, start_at, end_at, status, customer_id, service_address_id, resource_id, booking_group_id, booking_pets(id), resource:resources(name)")
        .eq("tenant_id", tenantId)
        .not("status", "in", "(cancelled,no_show)")
        .or(
          `and(start_at.gte.${from}T00:00:00+02:00,start_at.lte.${to}T23:59:59+02:00),` +
            `and(service_type.in.(hotel_dog,hotel_cat),end_at.gte.${from}T00:00:00+02:00,end_at.lte.${to}T23:59:59+02:00)`,
        )
        .order("start_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.id, customer_id: r.customer_id, service_address_id: r.service_address_id, resource_id: r.resource_id, booking_group_id: r.booking_group_id, pet_count: r.booking_pets?.length ?? 0,
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
    const stops = new Set<string>();
    const bump = (key: string, col: ColKey, amount = 1) => {
      const b = buckets.get(key) ?? {
        daycare: 0,
        grooming_inhouse: 0,
        grooming_mobile: 0, mobile_stops: 0,
        hotel_in: 0,
        hotel_out: 0,
        pickup_dropoff: 0,
      };
      b[col] += amount;
      buckets.set(key, b);
    };
    for (const b of q.data ?? []) {
      if (b.start_at && saDay(b.start_at) >= from && saDay(b.start_at) <= to) {
        const key = bucketKey(b.start_at, groupBy);
        if (b.service_type === "hotel_dog" || b.service_type === "hotel_cat") bump(key, "hotel_in", b.pet_count);
        else if (COLS.some((c) => c.key === b.service_type)) bump(key, b.service_type as ColKey, b.pet_count);
        if (b.service_type === "grooming_mobile") { const stop = mobileStopKey(b); if (!stops.has(stop)) { bump(key, "mobile_stops"); stops.add(stop); } }
      }
      if (
        (b.service_type === "hotel_dog" || b.service_type === "hotel_cat") &&
        b.end_at &&
        saDay(b.end_at) >= from && saDay(b.end_at) <= to
      ) {
        bump(bucketKey(b.end_at, groupBy), "hotel_out", b.pet_count);
      }
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([key, counts]) => ({
        key,
        label: bucketLabel(key, groupBy),
        counts,
        total: COLS.reduce((sum, c) => sum + (c.key === "mobile_stops" ? 0 : counts[c.key]), 0),
      }));
  }, [q.data, groupBy, from, to]);

  const vanRows = useMemo(() => {
    const m = new Map<string, { dogs: number; stops: Set<string> }>();
    for (const b of q.data ?? []) {
      if (b.service_type !== "grooming_mobile" || !b.start_at) continue;
      const name = b.resource_name ?? "Unassigned";
      const entry = m.get(name) ?? { dogs: 0, stops: new Set<string>() };
      entry.dogs += b.pet_count; entry.stops.add(mobileStopKey(b)); m.set(name, entry);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [q.data]);

  const totals = useMemo(() => {
    const t: Record<ColKey, number> = {
      daycare: 0,
      grooming_inhouse: 0,
      grooming_mobile: 0, mobile_stops: 0,
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
                  <span className="ml-2 tabular-nums text-muted-foreground">{count.dogs} dogs · {count.stops.size} stops</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
