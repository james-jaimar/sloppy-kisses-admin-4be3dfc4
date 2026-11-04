import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, Loader2, Plus, Save, Trash2, X } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { DOMAINS } from "./domains";
import {
  aggLabel,
  applyFilters,
  displayValue,
  groupRows,
  toCsv,
  type Aggregate,
  type DateBucket,
  type Filter,
  type FilterOp,
  type GroupSpec,
} from "./engine";

interface ReportConfig {
  name: string;
  domain: string;
  fields: string[];
  filters: Filter[];
  groups: GroupSpec[];
  aggs: Aggregate[];
  rangeDays?: number; // relative default range
}

const STARTERS: ReportConfig[] = [
  { name: "Grooming packages by breed", domain: "bookings", fields: ["start_at", "groom_package", "pet_breed", "pet_size"], filters: [{ field: "service", op: "contains", value: "grooming" }, { field: "status", op: "not_equals", value: "cancelled" }], groups: [{ field: "pet_breed" }, { field: "groom_package" }], aggs: [{ fn: "count" }], rangeDays: 90 },
  { name: "Monthly volumes per service", domain: "bookings", fields: ["start_at", "service", "status"], filters: [{ field: "status", op: "not_equals", value: "cancelled" }], groups: [{ field: "start_at", bucket: "month" }, { field: "service" }], aggs: [{ fn: "count" }, { fn: "distinct", field: "customer_number" }], rangeDays: 365 },
  { name: "Mobile grooming by suburb & van", domain: "bookings", fields: ["start_at", "service_suburb", "resource", "travel_fee"], filters: [{ field: "service", op: "equals", value: "grooming (mobile)" }], groups: [{ field: "service_suburb" }, { field: "resource" }], aggs: [{ fn: "count" }, { fn: "sum", field: "travel_fee" }], rangeDays: 90 },
  { name: "Hotel nights & extras", domain: "bookings", fields: ["booking_number", "start_at", "nights", "pet_species", "hotel_grooming"], filters: [{ field: "service", op: "contains", value: "hotel" }], groups: [{ field: "start_at", bucket: "month" }, { field: "pet_species" }], aggs: [{ fn: "count" }, { fn: "sum", field: "nights" }], rangeDays: 365 },
  { name: "Daycare walk-ins by weekday", domain: "daycare_attendance", fields: ["attendance_date", "status", "expected", "pet_name"], filters: [], groups: [{ field: "attendance_date", bucket: "weekday" }, { field: "expected" }], aggs: [{ fn: "count" }], rangeDays: 90 },
  { name: "Top-selling items", domain: "invoice_lines", fields: ["description", "quantity", "line_total"], filters: [{ field: "invoice_status", op: "not_equals", value: "cancelled" }], groups: [{ field: "description" }], aggs: [{ fn: "sum", field: "quantity" }, { fn: "sum", field: "line_total" }], rangeDays: 90 },
];

const OPS: { v: FilterOp; l: string }[] = [
  { v: "contains", l: "contains" },
  { v: "equals", l: "is" },
  { v: "not_equals", l: "is not" },
  { v: "gt", l: "greater than" },
  { v: "lt", l: "less than" },
  { v: "empty", l: "is blank" },
  { v: "not_empty", l: "is not blank" },
];

const iso = (d: Date) => d.toLocaleDateString("en-CA", { timeZone: "Africa/Johannesburg" });
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86400000));
const selectCls = "h-9 rounded-md border border-input bg-background px-2 text-sm";

export default function CustomReportPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const storeKey = `sk-custom-reports:${tenantId ?? "none"}`;

  const [domainKey, setDomainKey] = useState(DOMAINS[0].key);
  const domain = DOMAINS.find((d) => d.key === domainKey)!;
  const [fields, setFields] = useState<string[]>(domain.defaultFields);
  const [filters, setFilters] = useState<Filter[]>([]);
  const [groups, setGroups] = useState<GroupSpec[]>([]);
  const [aggs, setAggs] = useState<Aggregate[]>([{ fn: "count" }]);
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(iso(new Date()));
  const [fieldSearch, setFieldSearch] = useState("");
  const [saved, setSaved] = useState<ReportConfig[]>([]);
  const [sort, setSort] = useState<{ col: number; dir: 1 | -1 } | null>(null);

  useEffect(() => {
    try {
      setSaved(JSON.parse(localStorage.getItem(storeKey) ?? "[]"));
    } catch {
      setSaved([]);
    }
  }, [storeKey]);

  const persist = (list: ReportConfig[]) => {
    setSaved(list);
    localStorage.setItem(storeKey, JSON.stringify(list));
  };

  const applyConfig = (c: ReportConfig) => {
    setDomainKey(c.domain);
    setFields(c.fields);
    setFilters(c.filters);
    setGroups(c.groups);
    setAggs(c.aggs.length ? c.aggs : [{ fn: "count" }]);
    if (c.rangeDays) {
      setFrom(daysAgo(c.rangeDays));
      setTo(iso(new Date()));
    }
    setSort(null);
  };

  const changeDomain = (k: string) => {
    const d = DOMAINS.find((x) => x.key === k)!;
    setDomainKey(k);
    setFields(d.defaultFields);
    setFilters([]);
    setGroups([]);
    setAggs([{ fn: "count" }]);
    setSort(null);
  };

  const q = useQuery({
    enabled: !!tenantId,
    queryKey: ["reports", "custom", tenantId, domainKey, domain.dateField ? from : "", domain.dateField ? to : ""],
    queryFn: () => domain.load(tenantId!, from, to),
    staleTime: 60_000,
  });

  const fieldMap = useMemo(() => new Map(domain.fields.map((f) => [f.key, f])), [domain]);
  const filtered = useMemo(() => applyFilters(q.data ?? [], filters), [q.data, filters]);
  const numericFields = domain.fields.filter((f) => f.type === "number");

  // Table: grouped summary or raw rows
  const table = useMemo(() => {
    if (groups.length) {
      const res = groupRows(filtered, groups, aggs);
      const headers = [
        ...groups.map((g) => `${fieldMap.get(g.field)?.label ?? g.field}${g.bucket ? ` (${g.bucket})` : ""}`),
        ...aggs.map((a) => aggLabel(a, domain.fields)),
      ];
      const types = [...groups.map(() => "text" as const), ...aggs.map(() => "number" as const)];
      return { headers, types, rows: res.map((r) => [...r.keys, ...r.values] as unknown[]) };
    }
    const cols = fields.filter((k) => fieldMap.has(k));
    return {
      headers: cols.map((k) => fieldMap.get(k)!.label),
      types: cols.map((k) => fieldMap.get(k)!.type),
      rows: filtered.map((r) => cols.map((k) => r[k])),
    };
  }, [filtered, groups, aggs, fields, fieldMap, domain]);

  const sortedRows = useMemo(() => {
    const rows = [...table.rows];
    const s = sort ?? (groups.length ? { col: groups.length, dir: -1 as const } : null);
    if (!s || s.col >= table.headers.length) return rows;
    return rows.sort((a, b) => {
      const x = a[s.col], y = b[s.col];
      const nx = Number(x), ny = Number(y);
      const c = Number.isFinite(nx) && Number.isFinite(ny) && x !== "" && y !== "" && x !== null && y !== null ? nx - ny : String(x ?? "").localeCompare(String(y ?? ""));
      return c * s.dir;
    });
  }, [table, sort, groups.length]);

  const exportCsv = () => {
    const csv = toCsv(table.headers, sortedRows.map((r) => r.map((v, i) => (table.types[i] === "number" ? v : displayValue(v, table.types[i])))));
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${domain.key}-report-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const saveReport = () => {
    const name = window.prompt("Name this report");
    if (!name?.trim()) return;
    const cfg: ReportConfig = { name: name.trim(), domain: domainKey, fields, filters, groups, aggs };
    persist([...saved.filter((s) => s.name !== cfg.name), cfg]);
    toast.success(`Saved “${cfg.name}”`);
  };

  const fieldGroups = useMemo(() => {
    const m = new Map<string, typeof domain.fields>();
    const s = fieldSearch.toLowerCase();
    for (const f of domain.fields) {
      if (s && !f.label.toLowerCase().includes(s)) continue;
      m.set(f.group, [...(m.get(f.group) ?? []), f]);
    }
    return [...m.entries()];
  }, [domain, fieldSearch]);

  const toggleField = (k: string) => setFields((fs) => (fs.includes(k) ? fs.filter((x) => x !== k) : [...fs, k]));
  const truncated = (q.data?.length ?? 0) >= 20000;

  return (
    <>
      <AppHeader title="Custom report builder" subtitle="Pick what to look at, choose the columns, filter, then group to see trends" />
      <div className="space-y-4 p-4 md:p-6">
        {/* Templates */}
        <div className="sk-card p-4">
          <div className="mb-2 text-sm font-semibold">Quick starts</div>
          <div className="flex flex-wrap gap-2">
            {STARTERS.map((s) => (
              <Button key={s.name} variant="outline" size="sm" onClick={() => applyConfig(s)}>{s.name}</Button>
            ))}
          </div>
          {saved.length > 0 && (
            <>
              <div className="mb-2 mt-4 text-sm font-semibold">My saved reports</div>
              <div className="flex flex-wrap gap-2">
                {saved.map((s) => (
                  <span key={s.name} className="inline-flex items-center rounded-md border border-border">
                    <button className="px-3 py-1.5 text-sm hover:bg-muted" onClick={() => applyConfig(s)}>{s.name}</button>
                    <button aria-label={`Delete ${s.name}`} className="border-l border-border px-2 py-1.5 text-muted-foreground hover:text-destructive" onClick={() => persist(saved.filter((x) => x.name !== s.name))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="grid gap-4 lg:grid-cols-[300px_1fr]">
          {/* Field chooser */}
          <div className="sk-card space-y-3 p-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground">1. What do you want to report on?</label>
              <select className={`${selectCls} mt-1 w-full`} value={domainKey} onChange={(e) => changeDomain(e.target.value)}>
                {DOMAINS.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
              <p className="mt-1 text-xs text-muted-foreground">{domain.description}</p>
            </div>
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-muted-foreground">2. Columns ({fields.length})</label>
                <div className="flex gap-2 text-xs">
                  <button className="text-primary hover:underline" onClick={() => setFields(domain.fields.map((f) => f.key))}>All</button>
                  <button className="text-primary hover:underline" onClick={() => setFields([])}>None</button>
                </div>
              </div>
              <Input className="mt-1 h-8" placeholder="Find a field…" value={fieldSearch} onChange={(e) => setFieldSearch(e.target.value)} />
              <div className="mt-2 max-h-[55vh] space-y-3 overflow-y-auto pr-1">
                {fieldGroups.map(([g, fs]) => (
                  <div key={g}>
                    <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g}</div>
                    {fs.map((f) => (
                      <label key={f.key} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
                        <Checkbox checked={fields.includes(f.key)} onCheckedChange={() => toggleField(f.key)} />
                        {f.label}
                      </label>
                    ))}
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="min-w-0 space-y-4">
            {/* Filters */}
            <div className="sk-card space-y-3 p-4">
              <div className="flex flex-wrap items-end gap-3">
                {domain.dateField && (
                  <>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">{domain.dateLabel} from</label>
                      <Input type="date" className="h-9" value={from} onChange={(e) => setFrom(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">to</label>
                      <Input type="date" className="h-9" value={to} onChange={(e) => setTo(e.target.value)} />
                    </div>
                    <div className="flex gap-1">
                      {[["30d", 30], ["90d", 90], ["1y", 365]].map(([l, n]) => (
                        <Button key={l} variant="ghost" size="sm" onClick={() => { setFrom(daysAgo(n as number)); setTo(iso(new Date())); }}>{l}</Button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground">3. Only include rows where…</div>
                {filters.map((fl, i) => (
                  <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                    <select className={selectCls} value={fl.field} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}>
                      {domain.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                    </select>
                    <select className={selectCls} value={fl.op} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, op: e.target.value as FilterOp } : x)))}>
                      {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
                    </select>
                    {fl.op !== "empty" && fl.op !== "not_empty" && (
                      <Input className="h-9 w-48" value={fl.value} onChange={(e) => setFilters(filters.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} />
                    )}
                    <Button variant="ghost" size="icon" aria-label="Remove filter" onClick={() => setFilters(filters.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => setFilters([...filters, { field: domain.fields[0].key, op: "contains", value: "" }])}>
                  <Plus className="mr-1 h-4 w-4" /> Add filter
                </Button>
              </div>

              <div>
                <div className="text-xs font-medium text-muted-foreground">4. Group & count (leave empty to see every row)</div>
                {groups.map((g, i) => {
                  const isDate = fieldMap.get(g.field)?.type === "date";
                  return (
                    <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-muted-foreground">{i === 0 ? "Group by" : "then by"}</span>
                      <select className={selectCls} value={g.field} onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { field: e.target.value, bucket: fieldMap.get(e.target.value)?.type === "date" ? "month" : undefined } : x)))}>
                        {domain.fields.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                      </select>
                      {isDate && (
                        <select className={selectCls} value={g.bucket ?? "month"} onChange={(e) => setGroups(groups.map((x, j) => (j === i ? { ...x, bucket: e.target.value as DateBucket } : x)))}>
                          {["day", "week", "month", "year", "weekday"].map((b) => <option key={b} value={b}>{b}</option>)}
                        </select>
                      )}
                      <Button variant="ghost" size="icon" aria-label="Remove grouping" onClick={() => setGroups(groups.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>
                    </div>
                  );
                })}
                <Button variant="outline" size="sm" className="mt-2" onClick={() => { const k = domain.fields[0]; setGroups([...groups, { field: k.key, bucket: k.type === "date" ? "month" : undefined }]); }}>
                  <Plus className="mr-1 h-4 w-4" /> Add grouping
                </Button>
                {groups.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs text-muted-foreground">Show</div>
                    {aggs.map((a, i) => (
                      <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                        <select className={selectCls} value={a.fn} onChange={(e) => setAggs(aggs.map((x, j) => (j === i ? { fn: e.target.value as Aggregate["fn"], field: e.target.value === "count" ? undefined : x.field ?? (e.target.value === "distinct" ? domain.fields[0].key : numericFields[0]?.key) } : x)))}>
                          <option value="count">Count of rows</option>
                          {numericFields.length > 0 && <option value="sum">Sum of</option>}
                          {numericFields.length > 0 && <option value="avg">Average of</option>}
                          <option value="distinct">Number of different</option>
                        </select>
                        {a.fn !== "count" && (
                          <select className={selectCls} value={a.field} onChange={(e) => setAggs(aggs.map((x, j) => (j === i ? { ...x, field: e.target.value } : x)))}>
                            {(a.fn === "distinct" ? domain.fields : numericFields).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                          </select>
                        )}
                        {aggs.length > 1 && <Button variant="ghost" size="icon" aria-label="Remove measure" onClick={() => setAggs(aggs.filter((_, j) => j !== i))}><X className="h-4 w-4" /></Button>}
                      </div>
                    ))}
                    <Button variant="outline" size="sm" className="mt-2" onClick={() => setAggs([...aggs, { fn: "count" }])}><Plus className="mr-1 h-4 w-4" /> Add measure</Button>
                  </div>
                )}
              </div>
            </div>

            {/* Results */}
            <div className="sk-card p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm">
                  {q.isLoading ? <span className="inline-flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</span> : (
                    <>
                      <span className="font-semibold">{filtered.length.toLocaleString("en-ZA")}</span> matching rows
                      {groups.length > 0 && <> in <span className="font-semibold">{sortedRows.length}</span> groups</>}
                      {truncated && <span className="ml-2 text-destructive">Only the first 20,000 rows loaded — narrow the dates.</span>}
                    </>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={saveReport}><Save className="mr-1 h-4 w-4" /> Save report</Button>
                  <Button size="sm" onClick={exportCsv} disabled={!sortedRows.length}><Download className="mr-1 h-4 w-4" /> Export CSV</Button>
                </div>
              </div>
              {q.error && <div className="text-sm text-destructive">Could not load data: {(q.error as Error).message}</div>}
              <div className="max-h-[65vh] overflow-auto rounded-md border border-border">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      {table.headers.map((h, i) => (
                        <th key={h + i} className="cursor-pointer whitespace-nowrap px-3 py-2 text-left font-medium" onClick={() => setSort((s) => ({ col: i, dir: s?.col === i && s.dir === 1 ? -1 : 1 }))}>
                          {h}{sort?.col === i ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRows.slice(0, 1000).map((r, i) => (
                      <tr key={i} className="border-t border-border">
                        {r.map((v, j) => (
                          <td key={j} className={`whitespace-nowrap px-3 py-1.5 ${table.types[j] === "number" ? "text-right tabular-nums" : ""}`}>{displayValue(v, table.types[j])}</td>
                        ))}
                      </tr>
                    ))}
                    {!q.isLoading && sortedRows.length === 0 && (
                      <tr><td className="px-3 py-6 text-center text-muted-foreground" colSpan={Math.max(1, table.headers.length)}>No rows match — try a wider date range or fewer filters.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
              {sortedRows.length > 1000 && <p className="mt-2 text-xs text-muted-foreground">Showing the first 1,000 rows on screen; the CSV export includes all {sortedRows.length.toLocaleString("en-ZA")}.</p>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
