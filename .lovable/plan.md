## Fix: Invoice PDF download failing with CORS error

### What's actually wrong

The CORS error in the browser is a **symptom, not the cause**. Edge Function logs show the real crash:

```
TypeError: page.size is not a function
    at index.ts:111
```

`pdf-lib`'s `PDFPage` exposes `getSize()`, not `size()`. The function throws before it can return a response, so no CORS headers are sent, so the browser reports "No 'Access-Control-Allow-Origin' header." Fix the crash and the CORS message disappears.

### Change

In `supabase/functions/generate-invoice-pdf/index.ts`, line 111:

```ts
- const { width, height } = page.size();
+ const { width, height } = page.getSize();
```

That's the only code change needed. No CORS config change, no client change, no migration.

### Verify

1. Deploy (automatic).
2. From the invoice detail page, click **Download PDF** — the branded A4 invoice should download.
3. Check `generate-invoice-pdf` logs — no more `TypeError`.

### Not touching

- The other errors in your paste (`postMessage` origin, "message channel closed") are Lovable preview/extension noise, unrelated to the PDF.
- Daycare import, invoices list ordering — not part of this fix. Happy to do the invoice ordering as a separate small task if you want (e.g. sort by `issue_date desc, invoice_number desc`).
