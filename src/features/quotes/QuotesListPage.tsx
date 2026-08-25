import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, Plus } from "lucide-react";
import { format, parseISO } from "date-fns";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useQuotes } from "./queries";
import { NewQuoteDrawer } from "./NewQuoteDrawer";

const STATUSES = [
  { code: "all", label: "All" },
  { code: "draft", label: "Draft" },
  { code: "sent", label: "Sent" },
  { code: "accepted", label: "Accepted" },
  { code: "cancelled", label: "Cancelled" },
];

const CHIP: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  sent: "bg-sk-teal/10 text-sk-teal",
  accepted: "bg-sk-green/10 text-sk-green",
  cancelled: "bg-sk-orange-soft text-sk-orange",
  expired: "bg-sk-orange-soft text-sk-orange",
};

export default function QuotesListPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [status, setStatus] = useState("all");
  const [open, setOpen] = useState(false);
  const quotesQ = useQuotes(tenantId, status);

  return (
    <>
      <AppHeader
        title="Quotes"
        subtitle="Quote a hotel stay or a daycare place, then accept it to create the booking or enrolment and its invoice."
        actions={
          <button
            onClick={() => setOpen(true)}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90"
          >
            <Plus className="h-4 w-4" /> New quote
          </button>
        }
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap gap-2">
          {STATUSES.map((s) => (
            <button
              key={s.code}
              onClick={() => setStatus(s.code)}
              className={
                "rounded-full border px-3 py-1.5 text-xs font-semibold " +
                (status === s.code
                  ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
                  : "border-border bg-white text-muted-foreground hover:bg-muted")
              }
            >
              {s.label}
            </button>
          ))}
        </div>

        <div className="sk-card overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Quote</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Stay</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {(quotesQ.data ?? []).map((q) => (
                <tr key={q.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3">
                    <Link to={`/admin/quotes/${q.id}`} className="inline-flex items-center gap-2 font-semibold text-sk-coral-dark">
                      <FileText className="h-4 w-4" /> {q.estimate_number ?? "—"}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{q.customer?.full_name ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {q.start_at ? format(parseISO(q.start_at), "dd MMM yyyy") : "—"}
                    {q.end_at ? ` → ${format(parseISO(q.end_at), "dd MMM yyyy")}` : ""}
                  </td>
                  <td className="px-4 py-3 font-semibold">R{Number(q.total ?? 0).toFixed(2)}</td>
                  <td className="px-4 py-3">
                    <span className={"rounded-full px-2 py-1 text-[11px] font-semibold " + (CHIP[q.status] ?? CHIP.draft)}>
                      {q.status}
                    </span>
                  </td>
                </tr>
              ))}
              {!quotesQ.isLoading && (quotesQ.data ?? []).length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    No quotes yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {open && tenantId && <NewQuoteDrawer tenantId={tenantId} onClose={() => setOpen(false)} />}
    </>
  );
}
