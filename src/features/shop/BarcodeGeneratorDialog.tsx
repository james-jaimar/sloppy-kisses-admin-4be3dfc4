import { useEffect, useState } from "react";
import { Check, Loader2, Printer, RefreshCw, ScanLine, X } from "lucide-react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Product } from "@/features/shop/queries";
import { useSaveProductBarcode } from "@/features/shop/barcodeLinks";
import { useBarcodeScanner, playTone } from "@/features/pos/useBarcodeScanner";
import { ean13Svg, isValidEan13, randomInternalEan13 } from "@/features/shop/ean13";

async function uniqueCode(tenantId: string): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const c = randomInternalEan13();
    const [{ data: a }, { data: b }] = await Promise.all([
      supabase.from("product_barcodes" as any).select("id").eq("tenant_id", tenantId).eq("code", c).maybeSingle(),
      supabase.from("products").select("id").eq("tenant_id", tenantId).eq("barcode", c).maybeSingle(),
    ]);
    if (!a && !b) return c;
  }
  throw new Error("Could not find a free code, try again");
}

function printLabels(p: Product, code: string, count: number, widthMm: number, heightMm: number) {
  const svg = ean13Svg(code);
  const name = p.name.replace(/[<>&]/g, "");
  const label = `<div class="l"><div class="n">${name}</div>${svg}</div>`;
  const w = window.open("", "_blank", "width=480,height=640");
  if (!w) { toast.error("Allow pop-ups to print labels"); return; }
  w.document.write(`<!doctype html><html><head><title>${code}</title><style>
    @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
    html,body{margin:0;padding:0;background:#fff}
    .l{width:${widthMm}mm;height:${heightMm}mm;box-sizing:border-box;padding:1.5mm 3mm;display:flex;flex-direction:column;justify-content:center;page-break-after:always;overflow:hidden}
    .n{font:600 8pt sans-serif;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-align:center;margin-bottom:1mm}
    svg{width:100%;flex:1;min-height:0}
  </style></head><body>${label.repeat(count)}<script>onload=()=>{print();}</script></body></html>`);
  w.document.close();
}

export function BarcodeGeneratorDialog({ tenantId, product, onClose }: { tenantId: string; product: Product; onClose: () => void }) {
  const save = useSaveProductBarcode(tenantId);
  const existing = product.barcode && isValidEan13(product.barcode) ? product.barcode : null;
  const [code, setCode] = useState<string | null>(existing);
  const [saved, setSaved] = useState(Boolean(existing));
  const [busy, setBusy] = useState(false);
  const stock = Math.max(1, Math.round(Number((product as any).stock_on_hand ?? (product as any).stock_qty ?? 1)) || 1);
  const [count, setCount] = useState(stock);
  const [widthMm, setWidthMm] = useState(Number(localStorage.getItem("sk.labelW")) || 62);
  const [heightMm, setHeightMm] = useState(Number(localStorage.getItem("sk.labelH")) || 30);
  const [test, setTest] = useState<"idle" | "ok" | "bad">("idle");
  const [testInput, setTestInput] = useState("");

  useEffect(() => { localStorage.setItem("sk.labelW", String(widthMm)); localStorage.setItem("sk.labelH", String(heightMm)); }, [widthMm, heightMm]);
  useEffect(() => { if (!code) generate(); /* eslint-disable-next-line */ }, []);

  function check(v: string) {
    if (!code) return;
    const ok = v.trim() === code;
    setTest(ok ? "ok" : "bad");
    playTone(ok ? "hit" : "miss");
  }
  useBarcodeScanner((s) => { setTestInput(s); check(s); });

  async function generate() {
    setBusy(true);
    try { setCode(await uniqueCode(tenantId)); setSaved(false); setTest("idle"); }
    catch (e: any) { toast.error(e?.message); }
    finally { setBusy(false); }
  }
  async function saveCode() {
    if (!code) return;
    setBusy(true);
    try { await save.mutateAsync({ code, productId: product.id }); setSaved(true); toast.success(`Saved to ${product.name}`); }
    catch (e: any) { toast.error(e?.message ?? "Could not save"); }
    finally { setBusy(false); }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] grid place-items-center bg-foreground/40 p-4" onClick={onClose}>
      <div className="sk-card w-full max-w-lg space-y-4 bg-card p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-lg font-bold">Make a barcode</div>
            <div className="text-sm text-muted-foreground">{product.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close"><X className="h-5 w-5" /></button>
        </div>

        <div className="rounded-xl border border-border bg-background p-4">
          {code ? <div className="mx-auto max-w-xs" dangerouslySetInnerHTML={{ __html: ean13Svg(code) }} /> : <div className="h-24 animate-pulse" />}
        </div>

        {!saved ? (
          <div className="flex gap-2">
            <button onClick={generate} disabled={busy} className="inline-flex h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm font-semibold">
              <RefreshCw className="h-4 w-4" /> New number
            </button>
            <button onClick={saveCode} disabled={busy || !code} className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground disabled:opacity-40">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Save to product
            </button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-2 text-xs font-semibold text-muted-foreground">
              <label>Labels<input type="number" min={1} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
              <label>Width mm<input type="number" min={20} value={widthMm} onChange={(e) => setWidthMm(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
              <label>Height mm<input type="number" min={15} value={heightMm} onChange={(e) => setHeightMm(Number(e.target.value))} className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-2 text-sm text-foreground" /></label>
            </div>
            <button onClick={() => code && printLabels(product, code, count, widthMm, heightMm)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-semibold text-primary-foreground">
              <Printer className="h-4 w-4" /> Print {count} label{count === 1 ? "" : "s"}
            </button>
            <div className="space-y-2 rounded-xl border border-border p-3">
              <div className="flex items-center gap-2 text-sm font-semibold"><ScanLine className="h-4 w-4" /> Test-scan a printed label</div>
              <input value={testInput} onChange={(e) => { setTestInput(e.target.value); if (e.target.value.length >= 13) check(e.target.value); }}
                placeholder="Scan now…" className="h-10 w-full rounded-lg border border-border bg-background px-2 font-mono text-sm" />
              {test === "ok" && <div className="text-sm font-semibold text-primary">✓ Scans correctly — stick them on.</div>}
              {test === "bad" && <div className="text-sm font-semibold text-destructive">That didn’t match. Check printer darkness or label size and try again.</div>}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
