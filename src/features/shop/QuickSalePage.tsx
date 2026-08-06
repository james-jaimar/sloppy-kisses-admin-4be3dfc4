import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Minus, Plus, Search, ShoppingCart, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCustomers } from "@/features/customers/queries";
import { usePaymentMethods } from "@/features/invoices/queries";
import {
  useDefaultLocation, useProducts, useQuickSale, useStockLocations, useStockOnHand, type Product,
} from "./queries";

interface Line { product: Product; qty: number; }

export default function QuickSalePage() {
  const navigate = useNavigate();
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;

  const [search, setSearch] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [customerId, setCustomerId] = useState<string>("");
  const [locationId, setLocationId] = useState<string>("");
  const [cart, setCart] = useState<Line[]>([]);
  const [payNow, setPayNow] = useState(true);
  const [method, setMethod] = useState<string>("cash");
  const [reference, setReference] = useState("");

  const productsQ = useProducts(tenantId, { activeOnly: true, search });
  const locsQ = useStockLocations(tenantId);
  const { defaultLocation } = useDefaultLocation(tenantId);
  const effectiveLoc = locationId || defaultLocation?.id || "";
  const stockQ = useStockOnHand(tenantId, effectiveLoc || null);
  const customersQ = useCustomers({ tenantId, search: customerSearch, pageSize: 10 });
  const methodsQ = usePaymentMethods(tenantId, { activeOnly: true });
  const sale = useQuickSale(tenantId ?? "");

  const total = cart.reduce((s, l) => s + Number(l.product.sell_price ?? 0) * l.qty, 0);
  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>();
    (stockQ.data ?? []).forEach((r) => m.set(r.product_id, Number(r.qty_on_hand)));
    return m;
  }, [stockQ.data]);

  function addToCart(p: Product) {
    setCart((c) => {
      const idx = c.findIndex((l) => l.product.id === p.id);
      if (idx >= 0) { const next = [...c]; next[idx] = { ...next[idx], qty: next[idx].qty + 1 }; return next; }
      return [...c, { product: p, qty: 1 }];
    });
  }
  function updateQty(id: string, qty: number) {
    setCart((c) => c.map((l) => l.product.id === id ? { ...l, qty: Math.max(1, qty) } : l));
  }
  function removeLine(id: string) { setCart((c) => c.filter((l) => l.product.id !== id)); }

  const selectedCustomer = (customersQ.data?.rows ?? []).find((c) => c.id === customerId);

  async function completeSale() {
    if (!tenantId) return;
    if (!customerId) { toast.error("Choose a customer (create a walk-in customer if needed)"); return; }
    if (!effectiveLoc) { toast.error("Choose a stock location"); return; }
    if (cart.length === 0) { toast.error("Cart is empty"); return; }
    try {
      const invoiceId = await sale.mutateAsync({
        customer_id: customerId,
        location_id: effectiveLoc,
        lines: cart.map((l) => ({ product: l.product, qty: l.qty })),
        payment: payNow ? { amount: total, method, reference: reference || null } : null,
      });
      toast.success("Sale completed");
      navigate(`/admin/invoices/${invoiceId}`);
    } catch (err: any) { toast.error(err?.message ?? "Failed"); }
  }

  return (
    <>
      <AppHeader title="Quick sale" subtitle="Over-the-counter retail: pick products, attach to a customer, create invoice." />
      <div className="flex-1 p-6">
        <div className="grid gap-4 lg:grid-cols-3">
          {/* Products */}
          <div className="lg:col-span-2 space-y-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search products…"
                className="h-10 w-full rounded-lg border border-border bg-white pl-9 pr-3 text-sm" />
            </div>
            <div className="sk-card divide-y divide-border max-h-[560px] overflow-y-auto">
              {(productsQ.data ?? []).map((p) => {
                const qty = stockByProduct.get(p.id) ?? 0;
                return (
                  <button key={p.id} onClick={() => addToCart(p)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-sk-surface-muted/50">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground">{p.sku ?? "—"} · on hand {qty}</div>
                    </div>
                    <div className="tabular-nums font-semibold">
                      {p.sell_price != null ? `R ${Number(p.sell_price).toFixed(2)}` : "—"}
                    </div>
                    <Plus className="h-4 w-4 text-sk-coral" />
                  </button>
                );
              })}
              {(productsQ.data ?? []).length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">No products.</div>
              )}
            </div>
          </div>

          {/* Cart */}
          <div className="space-y-3">
            <div className="sk-card p-4 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold">
                <ShoppingCart className="h-4 w-4" /> Cart
              </div>
              {cart.length === 0 && <div className="text-sm text-muted-foreground">No items yet.</div>}
              {cart.map((l) => (
                <div key={l.product.id} className="flex items-center gap-2 border-t border-border pt-2 first:border-t-0 first:pt-0">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{l.product.name}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      R {Number(l.product.sell_price ?? 0).toFixed(2)} · line R {(Number(l.product.sell_price ?? 0) * l.qty).toFixed(2)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => updateQty(l.product.id, l.qty - 1)} className="grid h-7 w-7 place-items-center rounded border border-border"><Minus className="h-3.5 w-3.5" /></button>
                    <input type="number" value={l.qty} onChange={(e) => updateQty(l.product.id, Number(e.target.value))}
                      className="h-7 w-12 rounded border border-border bg-white px-1 text-center text-sm" />
                    <button onClick={() => updateQty(l.product.id, l.qty + 1)} className="grid h-7 w-7 place-items-center rounded border border-border"><Plus className="h-3.5 w-3.5" /></button>
                    <button onClick={() => removeLine(l.product.id)} className="grid h-7 w-7 place-items-center rounded border border-border text-sk-coral-dark"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-border pt-2 text-sm">
                <span className="text-muted-foreground">Total</span>
                <span className="text-lg font-bold tabular-nums">R {total.toFixed(2)}</span>
              </div>
            </div>

            <div className="sk-card p-4 space-y-3">
              <div className="text-sm font-semibold">Customer</div>
              <CustomerCombobox
                tenantId={tenantId}
                value={customerId || null}
                onChange={(id) => setCustomerId(id ?? "")}
              />

              <div>
                <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Stock location</div>
                <select value={effectiveLoc} onChange={(e) => setLocationId(e.target.value)}
                  className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm">
                  {(locsQ.data ?? []).filter((l) => l.active).map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={payNow} onChange={(e) => setPayNow(e.target.checked)} />
                Record payment now for full amount
              </label>

              {payNow && (
                <div className="grid gap-2">
                  <select value={method} onChange={(e) => setMethod(e.target.value)}
                    className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm">
                    {(methodsQ.data ?? []).map((m: any) => (
                      <option key={m.id} value={m.code}>{m.label}</option>
                    ))}
                    {(methodsQ.data ?? []).length === 0 && (
                      <>
                        <option value="cash">Cash</option>
                        <option value="card">Card</option>
                        <option value="eft">EFT</option>
                      </>
                    )}
                  </select>
                  <input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference (optional)"
                    className="h-9 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                </div>
              )}

              <button onClick={completeSale} disabled={sale.isPending || cart.length === 0}
                className="h-10 w-full rounded-lg bg-sk-coral text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                {sale.isPending ? "Processing…" : `Complete sale · R ${total.toFixed(2)}`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}