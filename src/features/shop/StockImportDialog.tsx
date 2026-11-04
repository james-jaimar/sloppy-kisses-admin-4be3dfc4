import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModalShell } from "@/components/modals/ModalShell";
import { supabase } from "@/integrations/supabase/client";
import { useProducts, useRetailSettings } from "./queries";
import { parseStockImport, STOCK_TEMPLATE, type NewStockRow } from "./stockImport";

export function StockImportDialog({ tenantId, locationId, onClose }: { tenantId: string; locationId: string; onClose: () => void }) {
  const products = useProducts(tenantId); const settings = useRetailSettings(tenantId); const qc = useQueryClient();
  const [rows, setRows] = useState<NewStockRow[]>([]); const [errors, setErrors] = useState<string[]>([]); const [fileName, setFileName] = useState("");
  const [importId, setImportId] = useState(() => crypto.randomUUID());
  const save = useMutation({ mutationFn: async () => {
    const { data, error } = await supabase.rpc("import_new_stock", { p_tenant_id: tenantId, p_location_id: locationId, p_rows: rows, p_import_id: importId } as any);
    if (error) throw error; return data;
  }, onSuccess: async count => { await Promise.all(["products", "stock_on_hand", "stock_movements"].map(key => qc.invalidateQueries({ queryKey: [key] }))); toast.success(`${count} products imported with opening stock`); onClose(); }, onError: e => toast.error(e.message) });
  async function pick(file?: File) {
    if (!file) return; setFileName(file.name); setImportId(crypto.randomUUID());
    try { const result = parseStockImport(await file.text(), products.data ?? []); setRows(result.rows); setErrors(result.errors); } catch { setRows([]); setErrors(["Unable to read this CSV file."]); }
  }
  function template() { const url = URL.createObjectURL(new Blob([STOCK_TEMPLATE], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = "new-stock-template.csv"; a.click(); URL.revokeObjectURL(url); }
  return <ModalShell wide title="Import new stock" onClose={save.isPending ? undefined : onClose} footer={<div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={save.isPending}>Cancel</Button><Button onClick={() => save.mutate()} disabled={save.isPending || !rows.length || errors.length > 0 || !settings.data || products.isLoading || Boolean(products.error)}> {save.isPending ? "Importing…" : `Import ${rows.length} new products`}</Button></div>}>
    <div className="space-y-4 p-5"><div className="flex flex-wrap items-center gap-3"><Button variant="outline" onClick={template}><Download className="mr-2 h-4 w-4" />CSV template</Button><label className="flex items-center gap-2 text-sm"><Upload className="h-4 w-4" /><input type="file" accept=".csv,text/csv" disabled={save.isPending || products.isLoading || Boolean(products.error)} onChange={e => void pick(e.target.files?.[0])} /></label></div>
    {fileName && <div className="text-sm font-semibold">{fileName} · {rows.length} products · Opening stock {rows.reduce((n, r) => n + (Number.isFinite(r.initial_stock) ? r.initial_stock : 0), 0)}</div>}
    {products.error && <p className="text-destructive">Unable to check existing products.</p>}
    {!settings.isLoading && !settings.data && <p className="text-destructive">Save Retail settings before importing.</p>}
    {errors.length > 0 && <ul role="alert" className="space-y-1 text-sm text-destructive">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>}
    {rows.length > 0 && <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-border text-left"><th className="p-2">Product</th><th className="p-2">SKU / Xero code</th><th className="p-2">Opening stock</th><th className="p-2">Sell price</th><th className="p-2">VAT %</th></tr></thead><tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border"><td className="p-2">{r.name}</td><td className="p-2">{r.sku ?? r.external_code ?? "—"}</td><td className="p-2">{r.initial_stock}</td><td className="p-2">{r.sell_price ?? "—"}</td><td className="p-2">{r.vat_rate ?? settings.data?.default_vat_rate ?? "—"}</td></tr>)}</tbody></table></div>}
    </div></ModalShell>;
}