# Make "Book a service" impossible to miss in the customer portal

Today the only way into the booking flow (`/customer/bookings/new`) is one Quick-action tile on the dashboard, plus a button on the Bookings list. Customers land anywhere else and see nothing.

## What changes

1. **Sidebar / mobile menu**
   - Add a dedicated "Book a service" item to the customer navigation, directly under Dashboard, using a distinct icon (calendar-plus).
   - Style it as the primary action in the nav (coral pill) so it reads as a button, not just another link. Appears in the desktop sidebar and the mobile menu automatically.

2. **Persistent header action**
   - Add a small coral "Book" button in the portal header area so it is visible on every portal page on both desktop and mobile, not just when the nav is open.

3. **Contextual entry points**
   - My Pets page and each pet detail: "Book for {pet}" link that jumps into the service picker.
   - Empty states on Bookings, Invoices, Documents: friendly "You have no bookings yet — book a service" CTA.
   - Booking detail: "Book another" action after a completed/cancelled booking.

4. **Service picker reachability**
   - Keep the existing five-service picker as the single destination; all new links point at `/customer/bookings/new`.

## Technical notes

- `src/constants/navigation.ts`: add the entry to `customerNav` with an optional `primary` flag.
- `src/components/layout/AppSidebar.tsx` (`SidebarNavList`): honour the `primary` flag for coral styling; shared by `MobileTopBar`.
- `src/components/layout/CustomerLayout.tsx` or `AppHeader`: render the persistent Book button for portal routes only.
- Touch points: `MyPetsPage.tsx`, `MyPetDetailPage.tsx`, `MyBookingsPage.tsx`, `MyBookingDetailPage.tsx`, `MyInvoicesPage.tsx`, `MyDocumentsPage.tsx`.
- No backend or booking-logic changes; presentation only.
