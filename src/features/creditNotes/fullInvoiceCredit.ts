type InvoiceCreditSource = {
  description: string;
  line_total: number;
  vat_amount: number | null;
};

/** Credit-note lines store final credit amounts, unlike invoice lines which store net totals. */
export function fullInvoiceCreditLines(items: InvoiceCreditSource[]) {
  return items.map((item) => ({
    description: item.description,
    quantity: 1,
    unit_price: Math.round((Number(item.line_total) + Number(item.vat_amount ?? 0)) * 100) / 100,
  }));
}