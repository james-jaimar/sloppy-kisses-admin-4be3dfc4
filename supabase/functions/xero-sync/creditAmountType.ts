/** Local credit lines contain the final credit amount. Preserve already-linked Xero documents. */
export function creditAmountType(xeroCreditNoteId: string | null | undefined, configuredType: string) {
  return xeroCreditNoteId ? configuredType : "Inclusive";
}