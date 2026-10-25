/** Estimates remain anonymously accept-able; legacy pro formas are not quotes. */
export function quoteAcceptanceToken(documentKind: unknown, publicToken: string | null | undefined): string | null {
  return documentKind === "proforma" ? null : publicToken ?? null;
}