import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Barcode, Clock, Inbox, Layers, Search, X,
} from "lucide-react";
import { toast } from "sonner";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useHasPermission } from "@/lib/permissions/permissions";
import { CustomerCombobox, type CustomerOption } from "@/components/customers/CustomerCombobox";
import {
  useCategoryTree, useDefaultLocation, useProductBrands, useProducts, useRetailSettings,
  useStockLocations, useStockOnHand, type Product,
} from "@/features/shop/queries";
import {
  cartTotal, useDeleteParkedSale, useEnsureWalkInCustomer, useParkSale, useParkedSales,
  usePosSale, useRecentSales, type PosLine, type PosSaleResult, type PosTender,
} from "./queries";
import PosProductGrid from "./PosProductGrid";
import PosSalePanel from "./PosSalePanel";
import TenderDialog from "./TenderDialog";
import ReceiptView from "./ReceiptView";
import BarcodeLinkSheet from "./BarcodeLinkSheet";
import { useRecordUnknownBarcode } from "./barcodeQueries";
import { playTone, useBarcodeScanner } from "./useBarcodeScanner";


type ScanFeedback = { kind: "hit" | "miss"; text: string } | null;

export default function PosPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? "";

  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [subCategoryId, setSubCategoryId] = useState<string>("all");
  const [brandId, setBrandId] = useState<string>("all");
  const [lines, setLines] = useState<PosLine[]>([]);
  const [discount, setDiscount] = useState(0);
  const [customerId, setCustomerId] = useState<string>("");
  const [customerName, setCustomerName] = useState("Walk-in customer");
  const [customerEmail, setCustomerEmail] = useState<string | null>(null);
  const [showCustomer, setShowCustomer] = useState(false);
  const [showTender, setShowTender] = useState(false);
  const [tenderMethod, setTenderMethod] = useState<string | undefined>();
  const [showParked, setShowParked] = useState(false);
  const [showRecent, setShowRecent] = useState(false);
  const [scan, setScan] = useState<ScanFeedback>(null);
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [receipt, setReceipt] = useState<{ result: PosSaleResult; lines: PosLine[]; discount: number; tenders: PosTender[]; customerName: string; customerEmail: string | null } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const canLinkBarcode = useHasPermission("pos.barcode.link");


  const productsQ = useProducts(tenantId, { activeOnly: true });
  const tree = useCategoryTree(tenantId);
  const brandsQ = useProductBrands(tenantId);
  const locsQ = useStockLocations(tenantId);
  const { defaultLocation } = useDefaultLocation(tenantId);
  const settingsQ = useRetailSettings(tenantId);
  const settings = settingsQ.data;
  const locationId = settings?.pos_location_id || defaultLocation?.id || locsQ.data?.[0]?.id || "";
  const stockQ = useStockOnHand(tenantId, locationId || null);
  const pageSize = Math.max(8, Number(settings?.pos_page_size ?? 24));
  const beepOnScan = settings?.scan_beep !== false;
  const unknownAction = settings?.unknown_barcode_action ?? "link";
  const recordUnknown = useRecordUnknownBarcode(tenantId);

  const parkedQ = useParkedSales(tenantId);
  const recentQ = useRecentSales(tenantId, 15);

  const ensureWalkIn = useEnsureWalkInCustomer(tenantId);
  const parkSale = useParkSale(tenantId);
  const deleteParked = useDeleteParkedSale(tenantId);
  const sale = usePosSale(tenantId);

  const walkInId = settings?.walkin_customer_id ?? null;
  const isWalkIn = !customerId || customerId === walkInId;

  const stockByProduct = useMemo(() => {
    const m = new Map<string, number>();
    (stockQ.data ?? []).forEach((r) => m.set(r.product_id, Number(r.qty_on_hand)));
    return m;
  }, [stockQ.data]);

  const subCategories = categoryId === "all" ? [] : tree.childrenOf(categoryId);

  const products = useMemo(() => {
    const all = (productsQ.data ?? []) as Product[];
    const term = search.trim().toLowerCase();
    const catIds =
      subCategoryId !== "all" ? [subCategoryId] : categoryId !== "all" ? tree.familyIds(categoryId) : null;
    return all.filter((p) => {
      if (p.sell_in_pos === false) return false;
      if (catIds && !(p.category_id && catIds.includes(p.category_id))) return false;
      if (brandId !== "all" && p.brand_id !== brandId) return false;
      if (!term) return true;
      return [p.name, p.sku, p.barcode, p.external_code, p.variant_label, p.size_pack]
        .some((v) => v?.toLowerCase().includes(term));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productsQ.data, search, categoryId, subCategoryId, brandId, tree.all.length]);

  useEffect(() => {
    if (!scan) return;
    const t = setTimeout(() => setScan(null), 2200);
    return () => clearTimeout(t);
  }, [scan]);

  // Filters changing means we're looking at a different set — go back to page one.
  useEffect(() => { setPage(1); }, [search, categoryId, subCategoryId, brandId]);

  function addToCart(p: Product, qty = 1) {
    setLines((c) => {
      const i = c.findIndex((l) => l.product.id === p.id);
      if (i === -1) return [...c, { product: p, qty }];
      const next = [...c];
      next[i] = { ...next[i], qty: next[i].qty + qty };
      return next;
    });
  }

  function changeQty(productId: string, qty: number) {
    setLines((c) => (qty === 0 ? c.filter((l) => l.product.id !== productId) : c.map((l) => (l.product.id === productId ? { ...l, qty } : l))));
  }

  function handleScan(code: string) {
    const all = (productsQ.data ?? []) as Product[];
    const hit = all.find((p) => p.barcode && p.barcode.toLowerCase() === code.toLowerCase())
      ?? all.find((p) => p.sku && p.sku.toLowerCase() === code.toLowerCase());
    if (hit) {
      addToCart(hit);
      if (beepOnScan) playTone("hit");
      setScan({ kind: "hit", text: `${hit.name} added` });
      return;
    }
    if (beepOnScan) playTone("miss");
    setScan({ kind: "miss", text: `No product for ${code}` });
    // Always keep the code so admin can match it up later.
    recordUnknown.mutate({ code });
    if (unknownAction === "link") setUnknownCode(code);
  }

  useBarcodeScanner(handleScan, { enabled: !showTender && !receipt && !unknownCode });


  function resetSale() {
    setLines([]);
    setDiscount(0);
    setCustomerId("");
    setCustomerName("Walk-in customer");
    setCustomerEmail(null);
    setReceipt(null);
    setSearch("");
  }

  function askDiscount() {
    const raw = window.prompt("Discount amount in Rand (or 10% for a percentage)");
    if (!raw) return;
    const sub = cartTotal(lines);
    const val = raw.trim().endsWith("%")
      ? (sub * Number(raw.replace("%", "").trim())) / 100
      : Number(raw.replace(/[^0-9.]/g, ""));
    if (!Number.isFinite(val) || val <= 0) return toast.error("Enter a valid discount");
    setDiscount(Number(Math.min(val, sub).toFixed(2)));
  }

  async function completeSale(tenders: PosTender[], chargeToAccount: boolean) {
    try {
      let cust = customerId;
      if (!cust) cust = await ensureWalkIn.mutateAsync();
      if (!locationId) return toast.error("Set a stock location in Retail settings first");
      if (chargeToAccount && (!cust || cust === walkInId)) return toast.error("Pick a real customer to charge to account");

      const result = await sale.mutateAsync({
        customer_id: cust,
        location_id: locationId,
        lines,
        tenders: chargeToAccount ? [] : tenders,
        discount,
        till_name: settings?.till_name ?? null,
      });
      setShowTender(false);
      setReceipt({ result, lines, discount, tenders: chargeToAccount ? [] : tenders, customerName, customerEmail });
      toast.success(chargeToAccount ? "Charged to account" : "Payment captured");
    } catch (err: any) {
      toast.error(err?.message ?? "Could not complete the sale");
    }
  }

  function pickCustomer(id: string | null, customer: CustomerOption | null) {
    setCustomerId(id ?? "");
    setShowCustomer(false);
    setCustomerName(customer?.full_name || "Walk-in customer");
    setCustomerEmail(customer?.email ?? null);
  }

  const total = Math.max(0, cartTotal(lines) - discount);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-sk-surface-muted/40">
      {/* Top bar */}
      <header className="flex items-center gap-3 border-b border-border bg-white px-4 py-3">
        <Link to="/admin/shop-stock" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border" aria-label="Back">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div className="hidden min-w-0 sm:block">
          <div className="truncate text-sm font-semibold">{settings?.till_name || "Till"}</div>
          <div className="text-[11px] text-muted-foreground">{tenant?.name}</div>
        </div>
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={searchRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search or scan a product…"
            className="h-12 w-full rounded-xl border border-border bg-white pl-10 pr-10 text-base"
          />
          {search && (
            <button onClick={() => setSearch("")} className="absolute right-2 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-lg" aria-label="Clear">
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        <button onClick={() => setShowParked(true)} className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border" aria-label="Parked sales">
          <Inbox className="h-5 w-5" />
          {(parkedQ.data?.length ?? 0) > 0 && (
            <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-sk-coral px-1 text-[10px] font-bold text-white">
              {parkedQ.data!.length}
            </span>
          )}
        </button>
        <button onClick={() => setShowRecent(true)} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-border" aria-label="Recent sales">
          <Clock className="h-5 w-5" />
        </button>
      </header>

      {/* Scan feedback strip */}
      {scan && (
        <div className={"flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white " + (scan.kind === "hit" ? "bg-emerald-600" : "bg-destructive")}>
          <Barcode className="h-4 w-4" /> {scan.text}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* Products */}
        <main className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
            <CatChip active={categoryId === "all"} onClick={() => { setCategoryId("all"); setSubCategoryId("all"); }} label="All" />
            {tree.parents.filter((c) => c.active).map((c) => (
              <CatChip key={c.id} active={categoryId === c.id}
                onClick={() => { setCategoryId(c.id); setSubCategoryId("all"); }} label={c.name} />
            ))}
          </div>
          {subCategories.length > 0 && (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1">
              <SubChip active={subCategoryId === "all"} onClick={() => setSubCategoryId("all")} label="All" />
              {subCategories.filter((c) => c.active).map((c) => (
                <SubChip key={c.id} active={subCategoryId === c.id} onClick={() => setSubCategoryId(c.id)} label={c.name} />
              ))}
            </div>
          )}
          <div className="mb-3 flex items-center gap-2">
            <select value={brandId} onChange={(e) => setBrandId(e.target.value)}
              className="h-10 rounded-xl border border-border bg-white px-3 text-sm">
              <option value="all">All brands</option>
              {(brandsQ.data ?? []).filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <div className="text-xs text-muted-foreground">{products.length} items</div>
          </div>
          <PosProductGrid
            products={products}
            stockByProduct={stockByProduct}
            onAdd={(p) => addToCart(p)}
            loading={productsQ.isLoading}
            page={page}
            pageSize={pageSize}
            onPageChange={setPage}
          />

        </main>

        {/* Cart */}
        <aside className="flex min-h-0 max-h-[55vh] w-full shrink-0 flex-col border-t border-border lg:max-h-none lg:h-full lg:w-[420px] lg:border-l lg:border-t-0">
          <PosSalePanel
            lines={lines}
            discount={discount}
            customerLabel={customerName}
            onChangeQty={changeQty}
            onRemove={(id) => changeQty(id, 0)}
            onDiscount={askDiscount}
            onClearDiscount={() => setDiscount(0)}
            onPickCustomer={() => setShowCustomer(true)}
            onCharge={() => { setTenderMethod(undefined); setShowTender(true); }}
            onQuickTender={(m) => { setTenderMethod(m); setShowTender(true); }}
            busy={sale.isPending}
            saleNumberHint={settings?.till_name ?? undefined}
          />
          <div className="flex shrink-0 items-center gap-2 border-t border-border bg-white px-4 py-3">
            <button
              onClick={async () => {
                if (!lines.length) return;
                await parkSale.mutateAsync({ label: customerName, customer_id: customerId || null, cart: lines });
                toast.success("Sale parked");
                resetSale();
              }}
              disabled={!lines.length}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-40"
            >
              <Layers className="h-4 w-4" /> Park sale
            </button>
            <button
              onClick={resetSale}
              disabled={!lines.length}
              className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl border border-border text-sm font-semibold disabled:opacity-40"
            >
              <X className="h-4 w-4" /> Clear
            </button>
          </div>
        </aside>
      </div>

      {/* Customer picker */}
      {showCustomer && (
        <Overlay title="Attach a customer" onClose={() => setShowCustomer(false)}>
          <CustomerCombobox tenantId={tenantId} value={customerId} onChange={pickCustomer} />
          <button onClick={() => pickCustomer(null, null)} className="mt-3 h-12 w-full rounded-xl border border-border text-sm font-semibold">
            Use walk-in customer
          </button>
        </Overlay>
      )}

      {/* Parked sales */}
      {showParked && (
        <Overlay title="Parked sales" onClose={() => setShowParked(false)}>
          {(parkedQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nothing parked right now.</p>}
          {(parkedQ.data ?? []).map((p) => (
            <div key={p.id} className="flex items-center gap-2 border-b border-border py-3 last:border-b-0">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-semibold">{p.label || "Parked sale"}</div>
                <div className="text-xs text-muted-foreground">
                  {p.cart?.length ?? 0} items · R {Number(p.total ?? 0).toFixed(2)}
                </div>
              </div>
              <button
                onClick={() => {
                  setLines(p.cart ?? []);
                  setCustomerId(p.customer_id ?? "");
                  setCustomerName(p.label || "Walk-in customer");
                  deleteParked.mutate(p.id);
                  setShowParked(false);
                }}
                className="h-10 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white"
              >
                Resume
              </button>
              <button onClick={() => deleteParked.mutate(p.id)} className="grid h-10 w-10 place-items-center rounded-xl border border-border" aria-label="Discard">
                <X className="h-4 w-4" />
              </button>
            </div>
          ))}
        </Overlay>
      )}

      {/* Recent sales */}
      {showRecent && (
        <Overlay title="Recent sales" onClose={() => setShowRecent(false)}>
          {(recentQ.data ?? []).length === 0 && <p className="text-sm text-muted-foreground">No till sales yet today.</p>}
          {(recentQ.data ?? []).map((r) => (
            <Link
              key={r.id}
              to={`/admin/invoices/${r.id}`}
              className="flex items-center justify-between border-b border-border py-3 text-sm last:border-b-0"
            >
              <div>
                <div className="font-semibold">{r.invoice_number}</div>
                <div className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleTimeString("en-ZA")}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">R {Number(r.total ?? 0).toFixed(2)}</div>
                <div className="text-xs text-muted-foreground">{r.status}</div>
              </div>
            </Link>
          ))}
        </Overlay>
      )}

      {showTender && (
        <TenderDialog
          tenantId={tenantId}
          total={total}
          allowAccount={!isWalkIn}
          initialMethod={tenderMethod}
          busy={sale.isPending}
          onClose={() => setShowTender(false)}
          onConfirm={completeSale}
        />
      )}

      {receipt && (
        <ReceiptView
          tenantId={tenantId}
          result={receipt.result}
          lines={receipt.lines}
          discount={receipt.discount}
          tenders={receipt.tenders}
          customerName={receipt.customerName}
          customerEmail={receipt.customerEmail}
          tillName={settings?.till_name || "Till"}
          footer={settings?.receipt_footer ?? null}
          onNewSale={resetSale}
        />
      )}

      {unknownCode && (
        <BarcodeLinkSheet
          tenantId={tenantId}
          code={unknownCode}
          products={(productsQ.data ?? []) as Product[]}
          canLink={canLinkBarcode}
          onClose={() => setUnknownCode(null)}
          onLinked={(p) => addToCart(p)}
        />
      )}
    </div>

  );
}

function CatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "h-10 shrink-0 rounded-full border px-4 text-sm font-semibold " +
        (active ? "border-sk-coral bg-sk-coral text-white" : "border-border bg-white")
      }
    >
      {label}
    </button>
  );
}

function SubChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={
        "h-9 shrink-0 rounded-full border px-3 text-xs font-semibold " +
        (active ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark" : "border-border bg-white text-muted-foreground")
      }
    >
      {label}
    </button>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-6" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button onClick={onClose} className="grid h-10 w-10 place-items-center rounded-xl border border-border" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
