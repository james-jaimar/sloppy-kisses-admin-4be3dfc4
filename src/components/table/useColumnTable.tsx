import { useEffect, useMemo, useState } from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";

export interface ColumnDef<T> {
  key: string;
  label: string;
  /** Text used for filtering/sorting. */
  get: (row: T) => string;
  /** "select" builds a dropdown from the distinct values; "text" is a contains-search. */
  filter?: "text" | "select" | "none";
  /** Optional custom sort value (e.g. ISO dates, numbers). */
  sortValue?: (row: T) => string | number;
  className?: string;
}

type Sort = { key: string; asc: boolean } | null;

function load<V>(k: string, fallback: V): V {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as V) : fallback; } catch { return fallback; }
}

/** Per-column filters + click-to-sort headers, remembered on this device. */
export function useColumnTable<T>(rows: T[], columns: ColumnDef<T>[], storageKey: string, defaultSort: Sort = null) {
  const [filters, setFilters] = useState<Record<string, string>>(() => load(`${storageKey}.filters`, {}));
  const [sort, setSort] = useState<Sort>(() => load(`${storageKey}.sort`, defaultSort));

  useEffect(() => { localStorage.setItem(`${storageKey}.filters`, JSON.stringify(filters)); }, [filters, storageKey]);
  useEffect(() => { localStorage.setItem(`${storageKey}.sort`, JSON.stringify(sort)); }, [sort, storageKey]);

  const options = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const c of columns) {
      if (c.filter !== "select") continue;
      m[c.key] = Array.from(new Set(rows.map((r) => c.get(r)).filter(Boolean))).sort((a, b) => a.localeCompare(b));
    }
    return m;
  }, [rows, columns]);

  const view = useMemo(() => {
    let out = rows.filter((r) =>
      columns.every((c) => {
        const f = (filters[c.key] ?? "").trim().toLowerCase();
        if (!f || c.filter === "none") return true;
        const v = (c.get(r) ?? "").toLowerCase();
        return c.filter === "select" ? v === f : v.includes(f);
      }),
    );
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const val = col.sortValue ?? col.get;
        out = [...out].sort((a, b) => {
          const x = val(a), y = val(b);
          const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x ?? "").localeCompare(String(y ?? ""), undefined, { numeric: true });
          return sort.asc ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, columns, filters, sort]);

  const active = Object.values(filters).some((v) => v && v.trim());

  const headerCell = (key: string, extraClass = "px-5 py-3") => {
    const c = columns.find((x) => x.key === key)!;
    const on = sort?.key === key;
    const Icon = on ? (sort!.asc ? ArrowUp : ArrowDown) : ArrowUpDown;
    return (
      <th key={key} className={extraClass + " " + (c.className ?? "")}>
        <button type="button"
          onClick={() => setSort(on ? (sort!.asc ? { key, asc: false } : null) : { key, asc: true })}
          className="inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground">
          {c.label}
          <Icon className={"h-3 w-3 " + (on ? "" : "opacity-40")} />
        </button>
      </th>
    );
  };

  const filterCell = (key: string, extraClass = "px-5 pb-2") => {
    const c = columns.find((x) => x.key === key)!;
    const v = filters[key] ?? "";
    const set = (nv: string) => setFilters((f) => ({ ...f, [key]: nv }));
    const cls = "h-8 w-full min-w-[80px] rounded-md border border-border bg-white px-2 text-xs font-normal normal-case tracking-normal text-foreground";
    return (
      <th key={key} className={extraClass}>
        {c.filter === "none" ? null : c.filter === "select" ? (
          <select value={v} onChange={(e) => set(e.target.value)} className={cls}>
            <option value="">All</option>
            {(options[key] ?? []).map((o) => <option key={o} value={o.toLowerCase()}>{o}</option>)}
          </select>
        ) : (
          <input value={v} onChange={(e) => set(e.target.value)} placeholder="Filter…" className={cls} />
        )}
      </th>
    );
  };

  return {
    rows: view,
    total: rows.length,
    active,
    clear: () => setFilters({}),
    headerCell,
    filterCell,
  };
}
