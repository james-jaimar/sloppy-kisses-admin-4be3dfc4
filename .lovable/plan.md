# Fix: phone upload rejected by the documents check constraint

## What's wrong

The phone ("snap") upload saves each file with an origin of `phone`, but the `documents` table's check constraint `documents_uploaded_via_chk` only permits `portal`, `admin`, `system`, `import`. Confirmed by reading the live constraint definition and the insert in the `snap-upload` edge function. The QR flow works right up to the save, then fails with the error you saw.

## The fix

One database migration that replaces the constraint so it also allows `phone`:

```text
uploaded_via IN ('portal', 'admin', 'system', 'import', 'phone')
```

No frontend or edge function changes needed — `snap-upload` already records `phone`, which is the value worth keeping so staff can see a document arrived via mobile handoff.

## After the migration

Re-test: open a hotel booking, tap "Photo from phone", scan, upload. The file should save, the tile should flip to "On file", and the document should appear in the list.