# Replace the free-text collection address with the real, verified address

## The problem

On the hotel booking form (portal and admin), ticking "Collection required" or "Drop-off required" opens a plain free-text box, "Physical address for collection / drop-off". Customers already have Google-verified addresses saved on their profile, and the mobile/transport wizards already use the proper address picker. The typed text goes nowhere useful — it is stored only inside the accommodation form payload, and the booking's `service_address_id` stays empty, so a van job created from that stay has no routable address.

## What changes

In the "Arrival & collection" section, when either collection or drop-off is ticked:

- Show the same saved-address picker the transport and mobile-grooming wizards use — a list of the customer's saved addresses (with map thumbnail, verified badge) plus "New address" which opens the Google-backed address search.
- If the customer has no address on file, show a clear prompt to add one, opening the same search.
- If the chosen address has never been pinned on Google, show the amber "we couldn't pin this on the map yet" warning with the confirm-on-Google action, exactly as elsewhere.
- Block progressing/submitting the booking while collection or drop-off is ticked and no address is selected. In the customer portal, an unverified (unpinned) address is not accepted for a van visit; front desk keeps its manual escape hatch.
- The free-text box is removed. The selected address is saved on the booking as its service address, and its formatted text is also written into the form payload so the printed accommodation form and the booking card keep reading exactly as before.

## Technical notes

- `StayWindowSection` (`src/features/hotelForm/AccommodationFields.tsx`) gains optional props: `customerId`, `tenantId`, `addressId`, `onAddressChange`, `allowManual`. When they are supplied it renders `AddressSelector` (`src/features/customers/AddressSelector.tsx`) instead of the `Area` free-text field; the `collection_address` string is kept in the payload and set from the selected address's formatted address.
- `HotelRequestWizard.tsx`: hold `serviceAddressId` state, pass it into `StayWindowSection` with `allowManual={false}`, include it in the `stayReady`/`canSubmit` gates when pickup/drop-off is ticked, and pass `service_address_id` through `useBookingSubmit` (already supported end to end by `portal-create-booking`).
- `BookingFormModal.tsx`: wire its existing `serviceAddressId` state into `StayWindowSection` (manual allowed for staff) so front desk sets the same field.
- `AccommodationFormPage.tsx` (portal "complete the form later" page): same picker replaces its own copy of the free-text `Area`.
- No schema change — `bookings.service_address_id` and `customer_addresses` already exist and are what the van routing reads via `bookingAddressState`.
