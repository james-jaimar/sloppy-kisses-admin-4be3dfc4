import { useState } from "react";
import { Barcode, Link2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useHasPermission } from "@/lib/permissions/permissions";
import { useProducts } from "@/features/shop/queries";
import BarcodeLinkSheet from "@/features/pos/BarcodeLinkSheet";
import { useDeleteBarcodeQueueRow, useUnknownBarcodes } from "@/features/pos/barcodeQueries";

function fmt(ts: string) {
  return new Date(ts).toLocaleString("en-ZA", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function UnknownBarcodesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? "";
  const canLink = useHasPermission("pos.barcode.link");
  const rowsQ = useUnknownBarcodes(tenantId);
  const productsQ = useProducts(tenantId, { activeOnly: true });
  const del = useDeleteBarcodeQueueRow(tenantId);
  const [linking, setLinking] = useState<string | null>(null);

  const rows = rowsQ.data ?? [];

  return (
    <>
      <AppHeader
        title="Unknown barcodes"
        subtitle="Codes scanned at the till that aren’t on a product yet."
      />
      <div className="flex-1 p-4 sm:p-6">
        {rowsQ.isLoading && <div className="sk-card h-24 animate-pulse" />}

        {!rowsQ.isLoading && rows.length === 0 && (
          <div className="sk-card grid place-items-center p-10 text-center">
            <Barcode className="mb-2 h-6 w-6 text-muted-foreground" />
            <div className="text-sm font-semibold">Nothing waiting</div>
            <div className="text-xs text-muted-foreground">Every barcode scanned so far is matched to a product.</div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="sk-card divide-y divide-border overflow-hidden">
            {rows.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <div className="font-mono text-base font-bold tabular-nums">{r.code}</div>
                  <div className="text-xs text-muted-foreground">
                    Scanned {r.scan_count}× · last {fmt(r.last_seen_at)}
                  </div>
                  {r.note && <div className="mt-1 text-xs italic text-muted-foreground">“{r.note}”</div>}
                </div>
                {canLink && (
                  <button
                    onClick={() => setLinking(r.code)}
                    className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white"
                  >
                    <Link2 className="h-4 w-4" /> Link to product
                  </button>
                )}
                <button
                  onClick={async () => {
                    try {
                      await del.mutateAsync(r.id);
                      toast.success("Removed");
                    } catch (err: any) {
                      toast.error(err?.message ?? "Failed");
                    }
                  }}
                  className="grid h-10 w-10 place-items-center rounded-xl border border-border"
                  aria-label="Discard"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {linking && (
        <BarcodeLinkSheet
          tenantId={tenantId}
          code={linking}
          products={productsQ.data ?? []}
          canLink={canLink}
          onClose={() => setLinking(null)}
        />
      )}
    </>
  );
}
