export function checkoutGroomLine(pet: string, name: string, price: number, discountPct: number) {
  return { description: `${pet} — checkout grooming: ${name} (separately invoiced)`, quantity: 1,
    unit_price: Math.round(price * (1 - Math.min(100, Math.max(0, discountPct)) / 100) * 100) / 100 };
}