import Papa from "papaparse";
export interface NewStockRow { name: string; initial_stock: number; sku?: string; barcode?: string; external_code?: string; unit?: string; description?: string; cost_price?: number; sell_price?: number; vat_rate?: number; reorder_level?: number }
export const STOCK_TEMPLATE = "name,initial_stock,sku,barcode,external_code,unit,cost_price,sell_price,vat_rate,reorder_level,description\n";
export function parseStockImport(text: string, existing: { sku?: string | null; barcode?: string | null; external_code?: string | null }[]) {
  const parsed = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: "greedy", transformHeader: h => h.trim().toLowerCase() });
  const errors = parsed.errors.map(e => `Row ${(e.row ?? 0) + 2}: ${e.message}`);
  for (const h of ["name", "initial_stock"]) if (!parsed.meta.fields?.includes(h)) errors.push(`Missing column: ${h}`);
  if (!parsed.data.length || parsed.data.length > 1000) errors.push("Choose between 1 and 1000 product rows.");
  const rows: NewStockRow[] = []; const seen = new Set<string>();
  parsed.data.forEach((raw, i) => {
    const row: NewStockRow = { name: raw.name?.trim() ?? "", initial_stock: Number(raw.initial_stock) };
    if (!row.name) errors.push(`Row ${i + 2}: name is required.`);
    for (const key of ["initial_stock", "cost_price", "sell_price", "vat_rate", "reorder_level"] as const) {
      const value = raw[key]?.trim();
      if (!value && key !== "initial_stock") continue;
      const n = Number(value);
      if (!value || !Number.isFinite(n) || n < 0 || (key === "vat_rate" && n > 100)) errors.push(`Row ${i + 2}: invalid ${key}.`);
      row[key] = n;
    }
    for (const key of ["sku", "barcode", "external_code", "unit", "description"] as const) if (raw[key]?.trim()) row[key] = raw[key].trim();
    for (const key of ["sku", "barcode", "external_code"] as const) {
      const code = row[key]?.toLowerCase(); if (!code) continue;
      const token = `${key}:${code}`;
      if (seen.has(token) || existing.some(p => p[key]?.trim().toLowerCase() === code)) errors.push(`Row ${i + 2}: duplicate ${key} ${row[key]}.`);
      seen.add(token);
    }
    rows.push(row);
  });
  return { rows, errors };
}