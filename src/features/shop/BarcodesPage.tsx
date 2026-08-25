import { useMemo, useState } from "react";
import { Barcode, Check, Loader2, Search, Smartphone, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useHasPermission } from "@/lib/permissions/permissions";
import { useProducts, type Product } from "@/features/shop/queries";
import { StudioSnapDialog } from "@/features/uploads/StudioSnapDialog";
import { useBarcodeScanner, playTone } from "@/features/pos/useBarcodeScanner";
import {
  useBarcodeCoverage,
  useDeleteProductBarcode,
  useProductBarcodes,
  useSaveProductBarcode,
} from "@/features/shop/barcodeLinks";

/** Desk-scanner + phone workflow for putting barcodes onto products. */
export default function BarcodesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? "";
  const canLink = useHasPermission("pos.barcode.link");

  const [code, setCode] = useState("");
  const [search, setSearch] = useState("");
  const [missingOnly, setMissingOnly] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const productsQ = useProducts(tenantId, { activeOnly: true });
  const coverage = useBarcodeCoverage(tenantId);
  const codesQ = useProductBarcodes(tenantId);
  const save = useSaveProductBarcode(tenantId);
  const del = useDeleteProductBarcode(tenantId);

  // A hardware scanner burst anywhere on the page fills the code box.
  useBarcodeScanner((scanned) => {
    setCode(scanned);
    playTone("hit");
  });

  const codesByProduct = useMemo(() => {
    const map: Record<string, { id: string; code: string }[]> = {};
    for (const r of codesQ.data ?? []) {
      (map[r.product_id] ??= []).push({ id: r.id, code: r.code });
    }
    return map;
  }, [codesQ.data]);

  const rows = useMemo(() => {
    const all = (productsQ.data ?? []) as Product[];
    const s = search.trim().toLowerCase();
    return all
      .filter((p) => (missingOnly ? !p.barcode : true))
      .filter((p) =>
        !s ||
        p.name.toLowerCase().includes(s) ||
        (p.sku ?? "").toLowerCase().includes(s) ||
        (p.external_code ?? "").toLowerCase().includes(s) ||
        (p.barcode ?? "").toLowerCase().includes(s))
      .slice(0, 200);
  }, [productsQ.data, search, missingOnly]);

  const alreadyOn = useMemo(() => {
    const c = code.trim().toLowerCase();
    if (!c) return null;
    const hit = (codesQ.data ?? []).find((r) => r.code.toLowerCase() === c);
    if (!hit) return null;
    const p = (productsQ.data ?? []).find((x) => x.id === hit.product_id);
    return p?.name ?? "another product";
  }, [code, codesQ.data, productsQ.data]);

  async function link(p: Product) {
    if (!code.trim()) { toast.error("Scan or type a barcode first"); return; }
    setSavingId(p.id);
    try {
      await save.mutateAsync({ code: code.trim(), productId: p.id });
      toast.success(`${code.trim()} saved to ${p.name}`);
      setCode("");
      setSearch("");
      playTone("hit");
    } catch (e: any) {
      playTone("miss");
      toast.error(e?.message ?? "Could not save that code");
    } finally {
      setSavingId(null);
    }
  }

  const total = coverage.data?.total ?? 0;
  const missing = coverage.data?.missing ?? 0;

  return (
    <>
      <AppHeader
        title="Barcodes"
        subtitle="Scan an item, pick the product, and the till knows it forever."
        actions={
          canLink ? (
            <StudioSnapDialog tenantId={tenantId} mode="barcodes" buttonLabel="Use my phone" label="Barcode capture" />
          ) : undefined
        }
      />

      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Active products" value={total} />
          <Stat label="With a barcode" value={total - missing} tone="good" />
          <Stat label="Still to do" value={missing} tone={missing ? "warn" : "good"} />
        </div>

        {!canLink && (
          <div className="sk-card p-4 text-sm text-muted-foreground">
            You don’t have permission to link barcodes. Ask an admin for the “link barcodes” permission.
          </div>
        )}

        {canLink && (
          <>
            <div className="sk-card space-y-3 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scanned code</div>
              <div className="flex flex-wrap items-center gap-2">
                <Barcode className="h-5 w-5 shrink-0 text-muted-foreground" />
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="Fire the scanner at the item, or type the code"
                  className="h-12 min-w-0 flex-1 rounded-xl border border-border bg-white px-3 font-mono text-lg font-bold tabular-nums"
                />
                {code && (
                  <button onClick={() => setCode("")} className="grid h-12 w-12 place-items-center rounded-xl border border-border bg-white">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {alreadyOn && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs font-semibold text-amber-800">
                  This code is already on “{alreadyOn}”.
                </div>
              )}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Smartphone className="h-3.5 w-3.5" /> No desk scanner? Use “Use my phone” above.
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Find the product…"
                  className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm"
                />
              </div>
              <div className="inline-flex overflow-hidden rounded-xl border border-border">
                {([true, false] as const).map((m) => (
                  <button key={String(m)} onClick={() => setMissingOnly(m)}
                    className={`h-11 px-3 text-xs font-semibold ${missingOnly === m ? "bg-sk-coral text-white" : "bg-white text-muted-foreground"}`}>
                    {m ? "Needs a code" : "All products"}
                  </button>
                ))}
              </div>
            </div>

            <div className="sk-card divide-y divide-border overflow-hidden">
              {productsQ.isLoading && <div className="h-24 animate-pulse" />}
              {rows.map((p) => {
                const codes = codesByProduct[p.id] ?? [];
                return (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-semibold">{p.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {[p.variant_label, p.size_pack, p.sku].filter(Boolean).join(" · ") || "—"}
                      </div>
                      {codes.length > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {codes.map((c) => (
                            <span key={c.id} className="inline-flex items-center gap-1 rounded-lg bg-sk-surface-muted px-2 py-1 font-mono text-[11px]">
                              {c.code}
                              <button onClick={async () => {
                                try { await del.mutateAsync(c.id); toast.success("Removed"); }
                                catch (e: any) { toast.error(e?.message ?? "Failed"); }
                              }} aria-label={`Remove ${c.code}`}>
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => link(p)}
                      disabled={!code.trim() || savingId === p.id}
                      className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white disabled:opacity-40"
                    >
                      {savingId === p.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                      Save code here
                    </button>
                  </div>
                );
              })}
              {!productsQ.isLoading && rows.length === 0 && (
                <div className="p-10 text-center text-sm text-muted-foreground">No products match.</div>
              )}
            </div>
          </>
        )}
      </div>
    </>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "good" | "warn" }) {
  return (
    <div className="sk-card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-bold tabular-nums ${tone === "warn" ? "text-sk-coral" : tone === "good" ? "text-emerald-600" : ""}`}>
        {value}
      </div>
    </div>
  );
}
