# Hotel stays that need transport: auto-create the legs, and clean them up

Today a hotel stay can be flagged "pick-up / drop-off required" but nothing is ever created on the Pick-up / Drop-off board — the booking detail page only warns that no leg exists. This plan makes the system create the legs itself, bill them on the stay's invoice, pencil them for saved quotes, and remove them automatically when the stay or quote falls away.

## What changes for staff

- Ticking pick-up and/or drop-off on a hotel stay immediately creates provisional legs on the transport board: one on the arrival date, one on the collection date, unassigned to a van, showing the same status as the stay (Awaiting payment / Confirmed).
- The travel fee for those legs is added to the same hotel invoice, so the quote/invoice total already includes transport.
- Saved quotes with transport show as dashed "pencilled" cards on the transport board, so drivers can see potential load. They vanish when the hold expires or the quote is cancelled.
- If the stay is cancelled, marked no-show, or auto-released for non-payment, the linked legs (and any checkout-day groom) are cancelled automatically and their charges removed from the invoice — silently, no extra alerts.
- Moving the stay's dates moves the legs with it.
- The "Transport required — no leg scheduled" banner only appears if a leg is genuinely missing; otherwise the booking shows the linked legs with a link to each.

## Technical approach

**Schema**
- `bookings.parent_booking_id uuid` (self-reference, nullable) + `bookings.link_kind text` (`hotel_transport_pickup`, `hotel_transport_dropoff`, `hotel_checkout_groom`), indexed on `parent_booking_id`.
- Backfill `link_kind`/`parent_booking_id` for existing checkout-day grooms via `hotel_grooming_requests.grooming_booking_id`.

**Sync function** `public.sync_hotel_transport_legs(p_hotel_booking_id uuid)` (SECURITY DEFINER, `search_path = public`), idempotent per (parent, direction):
- Reads `hotel_booking_details.pickup_required / dropoff_required` and the stay's dates, customer, pets, and `service_address_id` (falls back to the customer's primary verified address).
- Creates or updates a `pickup_dropoff` booking per required direction, with `transport_details` (direction, address ids, planned window from the stay's check-in / check-out windows), `booking_pets` copied from the stay, `resource_id` left null (unassigned), status mirroring the parent (`pending_payment` until paid, otherwise `confirmed`).
- Cancels legs whose flag was switched off, and cancels/keeps in step when the parent moves to `cancelled` / `no_show` / released.
- Adds a transport fee line to the stay's invoice using the existing `invoice_items` pattern (`source_type = 'transport_leg'`, `source_id = leg id`), priced from the transport workflow settings. Respects the existing invoice-lock rules: if the invoice is sent/paid, the line is left alone and `invoice_review_needed` is flagged instead.

**Triggers**
- On `bookings` (hotel service types): after insert/update of `start_at`, `end_at`, `status`, `requires_transport` → call the sync.
- On `hotel_booking_details`: after insert/update of `pickup_required`, `dropoff_required`, windows → call the sync.
- Cascade: when a hotel booking's status becomes `cancelled` / `no_show`, cancel child bookings (`parent_booking_id = parent`) and strip their non-locked invoice lines. Same path used by the existing auto-release cron for unpaid holds and by `delete_booking`.

**Quotes (pencilled transport)**
- `portal-create-quote` and the admin `NewQuoteDrawer` store `pickup_required` / `dropoff_required` in `estimates.extras`; the hotel quote/portal wizards already collect these flags for bookings, so the same controls are reused for quotes.
- New `useTransportQuotesForDay` hook in `src/features/transport/queries.ts`: `draft`/`sent` estimates with a live `hold_expires_at`, hotel service types, whose arrival or collection date falls on the selected day and whose extras request transport.
- `UnassignedTransportStrip.tsx` renders these as dashed, non-draggable "Pencilled — quote" cards (customer, pets, hold countdown, link to the quote). No cleanup needed: expired or cancelled quotes drop out of the query.

**Booking detail**
- `BookingDetailPage.tsx`: replace the customer/date heuristic in `useTransportLegExistsForBooking` with a lookup on `parent_booking_id`, listing each linked leg (direction, date, van or "unassigned") and only warning when a required leg is missing or cancelled.

**Settings (settings-first rule)**
- Transport workflow settings screen gains: "Auto-create legs for hotel stays" toggle, default pick-up and drop-off window times, and which fee applies per leg — all tenant-scoped and permission-gated like the existing transport settings.
