import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, Loader2, Search, UserPlus, X } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useCustomers, type CustomerListRow } from "@/features/customers/queries";
import { CustomerFormModal } from "@/features/customers/CustomerFormModal";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

/** Turn whatever was typed into the search box into sensible new-customer fields. */
export function prefillFromTerm(term: string) {
  const t = term.trim();
  if (!t) return {};
  if (t.includes("@")) return { email: t };
  const digits = t.replace(/[^\d]/g, "");
  if (digits.length >= 7 && digits.length / t.replace(/\s/g, "").length > 0.7) return { mobile: t };
  const parts = t.split(/\s+/);
  return { first_name: parts[0], last_name: parts.slice(1).join(" ") || undefined };
}

export interface CustomerOption {
  id: string;
  full_name: string | null;
  customer_number: string | null;
  email: string | null;
  mobile: string | null;
}

const PAGE_SIZE = 25;

function useSelectedCustomer(
  tenantId: string | null | undefined,
  customerId: string | null,
  fallback: CustomerOption | null,
) {
  return useQuery({
    queryKey: ["customer", "combobox-selected", tenantId, customerId],
    enabled: Boolean(tenantId && customerId) && !fallback,
    staleTime: 60_000,
    queryFn: async (): Promise<CustomerOption | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("id, full_name, customer_number, email, mobile")
        .eq("id", customerId as string)
        .maybeSingle();
      if (error) throw error;
      return (data as CustomerOption) ?? null;
    },
  });
}

export function customerLabel(c: CustomerOption | CustomerListRow | null | undefined) {
  if (!c) return "";
  return c.full_name ?? "Unnamed";
}

export function customerSubLabel(c: CustomerOption | CustomerListRow | null | undefined) {
  if (!c) return "";
  return [c.customer_number, c.email ?? c.mobile].filter(Boolean).join(" · ") || "—";
}

interface Props {
  tenantId: string | null | undefined;
  value: string | null;
  onChange: (customerId: string | null, customer: CustomerOption | null) => void;
  /** Show the picker permanently expanded instead of as a dropdown. */
  inline?: boolean;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Pre-known customer so we don't refetch it. */
  initialCustomer?: CustomerOption | null;
}

export function CustomerCombobox({
  tenantId,
  value,
  onChange,
  inline = false,
  placeholder = "Search by name, customer number, email or mobile…",
  disabled = false,
  autoFocus = false,
  initialCustomer = null,
}: Props) {
  const [open, setOpen] = useState(false);
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(term), 250);
    return () => clearTimeout(t);
  }, [term]);

  useEffect(() => {
    if (inline) return;
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, inline]);

  const listQ = useCustomers({ tenantId, search: debounced, pageSize: PAGE_SIZE });
  const rows = listQ.data?.rows ?? [];
  const total = listQ.data?.total ?? rows.length;

  const fallback = useMemo(() => {
    if (!value) return null;
    if (initialCustomer && initialCustomer.id === value) return initialCustomer;
    const hit = rows.find((r) => r.id === value);
    return hit ? { id: hit.id, full_name: hit.full_name, customer_number: hit.customer_number, email: hit.email, mobile: hit.mobile } : null;
  }, [value, initialCustomer, rows]);

  const selectedQ = useSelectedCustomer(tenantId, value, fallback);
  const selected = fallback ?? selectedQ.data ?? null;

  const pick = (c: CustomerListRow) => {
    onChange(c.id, {
      id: c.id,
      full_name: c.full_name,
      customer_number: c.customer_number,
      email: c.email,
      mobile: c.mobile,
    });
    setOpen(false);
    setTerm("");
  };

  const results = (
    <>
      <div className="relative border-b border-border">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          autoFocus={autoFocus || (!inline && open)}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder={placeholder}
          className="h-10 w-full rounded-t-lg bg-white pl-9 pr-3 text-sm outline-none"
        />
      </div>
      <ul className="max-h-60 overflow-y-auto">
        {listQ.isLoading && (
          <li className="flex items-center gap-2 px-3 py-3 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Searching…
          </li>
        )}
        {listQ.isError && (
          <li className="px-3 py-3 text-sm text-destructive">Couldn’t load customers. Try again.</li>
        )}
        {!listQ.isLoading && !listQ.isError && rows.length === 0 && (
          <li className="px-3 py-3 text-sm text-muted-foreground">No customers found.</li>
        )}
        {rows.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => pick(c)}
              className={
                "flex w-full flex-col items-start px-3 py-2 text-left hover:bg-sk-surface-muted " +
                (c.id === value ? "bg-sk-coral-soft/40" : "")
              }
            >
              <span className="text-sm font-medium">{customerLabel(c)}</span>
              <span className="text-xs text-muted-foreground">{customerSubLabel(c)}</span>
            </button>
          </li>
        ))}
        {!listQ.isLoading && total > rows.length && (
          <li className="px-3 py-2 text-xs text-muted-foreground">
            Showing {rows.length} of {total} — keep typing to narrow it down.
          </li>
        )}
      </ul>
    </>
  );

  if (selected && value) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-border bg-sk-surface-muted px-3 py-2 text-sm">
        <div>
          <div className="font-medium">{customerLabel(selected)}</div>
          <div className="text-xs text-muted-foreground">{customerSubLabel(selected)}</div>
        </div>
        {!disabled && (
          <button
            type="button"
            onClick={() => {
              onChange(null, null);
              setTerm("");
              setOpen(true);
            }}
            className="text-xs text-sk-coral-dark hover:underline"
          >
            Change
          </button>
        )}
      </div>
    );
  }

  if (inline) {
    return <div className="rounded-lg border border-border">{results}</div>;
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex h-10 w-full items-center justify-between rounded-lg border border-border bg-white px-3 text-left text-sm disabled:opacity-50"
      >
        <span className="text-muted-foreground">Select a customer…</span>
        <ChevronDown className="h-4 w-4 text-muted-foreground" />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-border bg-white shadow-lg">
          <div className="flex items-center justify-end px-2 pt-2 md:hidden">
            <button type="button" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-muted">
              <X className="h-4 w-4" />
            </button>
          </div>
          {results}
        </div>
      )}
    </div>
  );
}