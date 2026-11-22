type XeroLine = { LineAmount?: number; TaxAmount?: number; Quantity?: number; Description?: string };
type XeroDocument = { Total: number; SubTotal: number; TotalTax: number; LineItems: XeroLine[] };

const cents = (amount: number) => Math.round((amount + Number.EPSILON) * 100);

/** Quotes can expose net lines even when Xero labels the document INCLUSIVE. */
export function legacyHotelGrossLines(document: XeroDocument): number[] {
  const net = document.LineItems.reduce((sum, line) => sum + (line.LineAmount ?? 0), 0);
  const includeTax = cents(net) === cents(document.SubTotal) && document.TotalTax > 0;
  const lines = document.LineItems.map(line => cents((line.LineAmount ?? 0) + (includeTax ? line.TaxAmount ?? 0 : 0)) / 100);
  if (cents(lines.reduce((sum, line) => sum + line, 0)) !== cents(document.Total)) {
    throw new Error("Xero line amounts do not match the document total; hold for review.");
  }
  return lines;
}

export function isImportedXeroHotelInvoice(invoice: {
  xero_invoice_id?: string | null;
  invoice_items?: { source_type?: string | null }[] | null;
}): boolean {
  return Boolean(invoice.xero_invoice_id && invoice.invoice_items?.some(line => line.source_type === "legacy_xero_hotel"));
}