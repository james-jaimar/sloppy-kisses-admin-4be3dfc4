import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Search } from "lucide-react";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useGlobalSearch, GROUP_LABEL, type GlobalSearchHit } from "@/lib/search/useGlobalSearch";

export function GlobalSearch() {
  const navigate = useNavigate();
  const { currentTenant, hasPermission } = useCurrentUser();
  const tenantId = currentTenant?.id ?? null;
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 220);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const scopes = useMemo(
    () => ({
      customers: hasPermission("customers.view"),
      pets: hasPermission("pets.view"),
      bookings: hasPermission("bookings.view"),
      invoices: hasPermission("invoices.view"),
    }),
    [hasPermission],
  );

  const searchQ = useGlobalSearch(tenantId, debounced, scopes);
  const hits = (searchQ.data ?? []) as GlobalSearchHit[];

  useEffect(() => setActive(0), [debounced]);

  function go(hit: GlobalSearchHit) {
    setOpen(false);
    setTerm("");
    navigate(hit.to);
  }

  const grouped = useMemo(() => {
    const map = new Map<string, GlobalSearchHit[]>();
    for (const h of hits) {
      if (!map.has(h.group)) map.set(h.group, []);
      map.get(h.group)!.push(h);
    }
    return Array.from(map.entries());
  }, [hits]);

  const showPanel = open && debounced.trim().length >= 2;

  return (
    <div className="relative flex-1 max-w-xl min-w-0" ref={wrapRef}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <input
        type="text"
        value={term}
        onChange={(e) => {
          setTerm(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, hits.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            if (hits[active]) {
              e.preventDefault();
              go(hits[active]);
            }
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Search customers, pets, bookings, invoices…"
        className="h-10 w-full rounded-xl border border-border bg-sk-surface-muted pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-sk-coral/40"
      />
      {showPanel && (
        <div className="absolute left-0 right-0 top-12 z-40 max-h-[70vh] overflow-y-auto rounded-xl border border-border bg-white p-1 shadow-lg">
          {searchQ.isFetching && hits.length === 0 && (
            <div className="flex items-center gap-2 px-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          )}
          {!searchQ.isFetching && hits.length === 0 && (
            <div className="px-3 py-4 text-sm text-muted-foreground">No matches for “{debounced}”</div>
          )}
          {grouped.map(([group, rows]) => (
            <div key={group} className="py-1">
              <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {GROUP_LABEL[group as keyof typeof GROUP_LABEL]}
              </div>
              {rows.map((h) => {
                const idx = hits.indexOf(h);
                return (
                  <button
                    key={h.group + h.id}
                    onMouseEnter={() => setActive(idx)}
                    onClick={() => go(h)}
                    className={
                      "flex w-full flex-col items-start rounded-lg px-3 py-2 text-left " +
                      (idx === active ? "bg-sk-surface-muted" : "hover:bg-sk-surface-muted")
                    }
                  >
                    <span className="text-sm font-medium">{h.title}</span>
                    {h.subtitle && <span className="text-xs text-muted-foreground">{h.subtitle}</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}