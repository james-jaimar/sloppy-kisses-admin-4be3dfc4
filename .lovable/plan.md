## Embed fonts in the invoice PDF

### Problem
The edge function uses pdf-lib's `StandardFonts.Helvetica` / `Helvetica-Bold`. These are PDF "base 14" fonts — they are referenced by name, not embedded. Some viewers substitute (e.g. ArialMT as shown in Document Properties), and printing on machines without a matching font can render inconsistently.

### Fix
Switch to a real TrueType font and embed it into the PDF so every viewer/printer renders identically.

### Changes to `supabase/functions/generate-invoice-pdf/index.ts`

1. Register fontkit with pdf-lib (required for custom TTF embedding):
   ```ts
   import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
   ...
   pdf.registerFontkit(fontkit);
   ```

2. Fetch a permissively licensed TTF at cold start and embed it (subset by default so file size stays small):
   - Use **Inter** Regular + Bold from the rsms/inter GitHub release (SIL OFL, safe to redistribute), fetched from a stable CDN like jsDelivr:
     - `https://cdn.jsdelivr.net/gh/rsms/inter@v4.0/docs/font-files/Inter-Regular.woff2` won't work (pdf-lib needs TTF/OTF, not woff2).
     - Use TTF instead: `https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.16/files/inter-latin-400-normal.woff` — also woff.
   - Safer choice: **Noto Sans** TTF from `https://cdn.jsdelivr.net/gh/notofonts/notofonts.github.io/fonts/NotoSans/hinted/ttf/NotoSans-Regular.ttf` and `NotoSans-Bold.ttf`.
   - Cache the fetched bytes in module scope so warm invocations don't refetch.

3. Replace:
   ```ts
   const reg = await pdf.embedFont(StandardFonts.Helvetica);
   const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
   ```
   with:
   ```ts
   const reg = await pdf.embedFont(regularBytes, { subset: true });
   const bold = await pdf.embedFont(boldBytes, { subset: true });
   ```
   If the font fetch fails, fall back to `StandardFonts.Helvetica` so PDFs still generate.

4. Remove the `StandardFonts` import if no longer needed.

No layout or query changes. No client changes. Redeploy the function after edit.

### Font choice
Proposing **Noto Sans** (Regular + Bold) — SIL OFL licensed, wide glyph coverage (handles é, ç, etc. that appear in customer names/addresses), clean modern sans that reads similarly to Helvetica/Arial so the invoice look barely shifts.

### Verification
- Re-download `INV00096.pdf`, open Document Properties → Fonts. Both entries should show **"Embedded Subset"** (not "Actual Font: ArialMT").
- Visual layout unchanged.
