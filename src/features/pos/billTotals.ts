export interface BillBase { total: number; tax_total: number; amount_paid: number; balance_due: number }
export interface BillAddition { quantity: number; unit_price: number; vat_rate: number }
const round = (n: number) => Number(n.toFixed(2));
export function billTotals(base: BillBase | null, additions: BillAddition[], discount: number) {
  const shopSubtotal = round(additions.reduce((sum, l) => sum + round(l.quantity * l.unit_price), 0));
  const shopTotal = round(Math.max(0, shopSubtotal - discount));
  // POS persists the overall discount as a separate zero-VAT negative line.
  const shopVat = round(additions.reduce((sum, l) => {
    const amount = round(l.quantity * l.unit_price);
    return sum + (l.vat_rate ? amount - amount / (1 + l.vat_rate / 100) : 0);
  }, 0));
  return { shopSubtotal, shopTotal, total: round((base?.total ?? 0) + shopTotal),
    vat: round((base?.tax_total ?? 0) + shopVat), paid: base?.amount_paid ?? 0,
    due: round((base?.balance_due ?? 0) + shopTotal) };
}