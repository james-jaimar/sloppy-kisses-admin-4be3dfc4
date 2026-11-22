/** Pure rules for offline customer reconciliation; no provider calls or writes. */
export function skNumber(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 99999) {
    throw new Error("Customer number must be between 1 and 99999");
  }
  return `SK${String(value).padStart(5, "0")}`;
}

export function allocateSkNumbers(existing: readonly string[], count: number): string[] {
  if (!Number.isInteger(count) || count < 0) throw new Error("Invalid allocation count");
  const highest = existing.reduce((max, number) => {
    const match = /^SK([0-9]+)$/.exec(number);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  return Array.from({ length: count }, (_, i) => skNumber(highest + i + 1));
}

export function saPhone(value: string | null | undefined): string {
  let digits = (value ?? "").replace(/\D/g, "");
  if (digits.startsWith("27")) digits = `0${digits.slice(2)}`;
  return /^0\d{9}$/.test(digits) ? digits : "";
}

export function inCreationWindow(createdUtc: string, startUtc: string, endUtc: string): boolean {
  const created = Date.parse(`${createdUtc.replace(/Z$/, "")}Z`);
  return Number.isFinite(created) && created >= Date.parse(startUtc) && created < Date.parse(endUtc);
}