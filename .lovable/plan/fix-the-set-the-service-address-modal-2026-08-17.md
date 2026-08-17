# Fix the "Set the service address" modal

## What's wrong

Confirmed by reading `src/features/bookings/AddressGate.tsx`, `src/features/customers/AddressSelector.tsx` and `src/features/customers/AddressFormDrawer.tsx`:

1. **Content spills out of the modal.** `AddressSelector` was built for a full-width page, not a dialog: its header row puts "New address" hard against the right edge with no gutter, and the address card row (map thumb + long formatted address on one line) is wider than the dialog body, so both push past the white panel — exactly what the screenshot shows.
2. **No way to search from this modal.** The only Google lookup lives inside `AddressFormDrawer`, which `AddressSelector` opens as a *second* fixed full-screen overlay. Opened from inside a dialog it lands behind/over the dialog awkwardly, so from this modal there is effectively no working address search — you can only pick an address the customer already has.

## What gets built

### 1. Modal that fits
- Give the dialog a proper padded, scrollable body with a fixed footer, and constrain its width on small screens.
- `AddressSelector` gets a compact/in-dialog layout: header wraps, "New address" sits inside the padding, the map thumbnail hides on narrow widths, and address text wraps instead of running on one line.

### 2. Real address search inside the modal
Restructure the dialog into two clear parts:

```text
Set the service address
--------------------------------------
Search for an address            [search box]
  87 Waterloo Rd, Bryanston, Sandton…
  12 Waterloo Ave, Craighall…
--------------------------------------
Or use a saved address
  (o) Home  PRIMARY
      35 St James Park, 134 Bellairs Dr…
--------------------------------------
              [Cancel]  [Save address]
```

- The Google search box (the existing `AddressAutocomplete` / `AddressField` search) is rendered inline at the top of the dialog — no nested drawer.
- Picking a suggestion shows the verified card with the unit/complex and gate-code fields, saves it to the customer's addresses, selects it, and stamps it onto the booking on Save.
- Saved addresses stay listed below for one-tap reuse; an unverified saved address still offers "Confirm this address", which now opens the same inline search rather than a second overlay.
- Suggestion dropdown is layered above the dialog so it is never clipped.

## Technical notes
- Add an `inline`/`compact` variant to `AddressSelector` (or a small `AddressPicker` used by the dialog) that renders `AddressField` inline and calls the existing `useCreateCustomerAddress` / `useUpdateCustomerAddress` hooks — same write path, no schema change.
- `FixAddressDialog` in `AddressGate.tsx` gets `max-h-[85dvh]`, `overflow-y-auto` body, `min-w-0` on flex children and `break-words` on address text.
- Same fix applies wherever `AddressSelector` is used inside a modal (booking form, portal wizards) since it is a shared component.
