## Calendar & app-wide improvements

Six focused improvements to the operations calendar plus a couple of shared UI pieces. All frontend/presentation work except item 6 (schema prep only, no email sending yet).

### 1. Current time indicator (red "now" line)

- Add a live `now` state that ticks every 60s (via `setInterval` in a small `useNow()` hook).
- Render a 2px `bg-sk-coral` line across the day/week/resource grids at the vertical offset for the current time.
  - Reuses the existing `positionFor(now, now, dayAnchor)` math.
  - Draw only when today falls inside the visible range; in week view it renders inside today's column only.
- Small red dot on the left edge of the line.

### 2. Fix event overflow into next hour

Root cause: `positionFor` computes a floating-point pixel height but the hour grid uses `h-14` (56px) rows, and the card sits inside a container padded off the row. Bookings that start on the hour boundary render 4–8 px too tall so they visually spill into the next slot.

- Change: compute `top`/`height` from **minutes-since-day-start / 60 × ROW_H** consistently, and subtract card padding (2px top + 2px bottom + 1px border) so a 60-minute booking renders exactly `ROW_H - gap` tall.
- Set `overflow: hidden` on `EventCard` and switch its inner text to `line-clamp-*` so a short slot never pushes content past its own box.
- Enforce `min-height: 20px` for very short bookings instead of the current 24px which currently pushes past the boundary on 15-min slots.
- Apply the same fix in `TimeDayView`, `ResourceDayView`, and `WeekView`.

### 3. Status indicators (icon + color + label)

Model the pattern used in the referenced Infusion Centre project: each status maps to `{ label, icon, tone }` and appears both on the event card (small icon in the corner) and as a chip in the detail panel.

Mapping (colors use existing sk-* tokens; no hardcoded hex):

| Status | Icon | Tone |
|---|---|---|
| draft | `FilePen` | slate-soft |
| requested | `Inbox` | sk-turquoise-soft |
| needs_info | `HelpCircle` | sk-orange-soft |
| approved | `CheckCircle2` | sk-green-soft |
| confirmed | `CalendarCheck` | sk-green |
| checked_in | `LogIn` | sk-turquoise |
| in_progress | `Loader2` (spin) | sk-coral |
| ready | `BellRing` | sk-orange |
| checked_out | `LogOut` | slate |
| completed | `CheckCheck` | sk-green-dark |
| cancelled | `XCircle` | muted |
| no_show | `AlertOctagon` | destructive-soft |

- Create `src/features/bookings/statusMeta.ts` exporting `BOOKING_STATUS_META` and a `<BookingStatusChip status />` component.
- `EventCard` gets a small status icon top-right (replacing the current lone warning icon; warning triangle stays but sits next to the status icon).
- Left border of `EventCard` keeps its service-type color; the small chip in the top-right shows status.
- Filter pills at the top get the same icon so admins scan them faster.

### 4. Collapsible sidebar

Match the Infusion Centre pattern already proven in `AdminLayout` there:

- `AppSidebar` gains a `collapsed` prop; when true, width shrinks from `w-64` to `w-16`, labels/badges hide, icons stay centered, badges become a small dot.
- Add a toggle button (chevron) in the sidebar header AND a floating "show menu" button in `AdminLayout` that appears only when collapsed (so the sidebar can also be fully hidden on request; we'll do collapsed-not-hidden by default to keep icons visible).
- Persist state in `localStorage` under `sk.sidebar.collapsed`.
- Header/logo shrinks to just the icon when collapsed.
- The customer layout is not affected.

### 5. Escape to close modals

- Extend `ModalShell` with a `useEffect` that listens for `keydown` on `document`, closes on `Escape` (only the top-most instance, using a small module-level stack so nested modals close one at a time).
- Also add a click-on-backdrop close (already common expectation), gated by an optional `closeOnBackdrop` prop defaulting to true, but only if `onClose` is provided.
- Applies automatically to every modal in the app since they all render through `ModalShell` (booking form, booking detail, customer form, pet form, booking request form, etc.).

### 6. Notification foundation (prep only, no SMTP wiring yet)

Groundwork so that when SMTP is enabled we just plug in the sender. No emails are actually sent in this step.

- New table `notification_events` (tenant-scoped): `id`, `tenant_id`, `event_type` (enum: `booking_created`, `booking_rescheduled`, `booking_cancelled`, `booking_status_changed`, `booking_request_created`, `booking_request_status_changed`), `booking_id`, `booking_request_id`, `customer_id`, `payload jsonb`, `status` (`pending` | `sent` | `failed` | `skipped`), `error`, `created_at`, `sent_at`. Standard grants + RLS scoped by tenant.
- Trigger `bookings_notify_changes` on `bookings` that inserts a `notification_events` row when:
  - a booking is created,
  - `start_at` or `end_at` changes (reschedule),
  - `status` changes,
  - `status` becomes `cancelled` or `no_show`.
- Same for `booking_requests` insert/status change.
- Add a customer preference column `notify_email boolean default true` on `customers` (drives whether events are `pending` or `skipped` at insert time).
- Frontend: `useUpdateBooking` and `useUpdateBookingStatus` don't change — the trigger handles queuing. Add a small "Notifications" badge in the booking detail panel showing the latest event status for this booking (pending/sent/failed) so admins see whether the customer will be emailed.
- The actual "send" is left as a TODO stub — a placeholder `send-notifications` edge function file will NOT be created in this step; only the queue is prepared, per your instruction that SMTP setup comes next.

### Technical notes

- No new libraries needed.
- All color usage stays on `sk-*` and semantic tokens.
- Types in `src/integrations/supabase/types.ts` regenerate automatically after the migration.
- Files touched: `CalendarWeekView.tsx`, `bookings/queries.ts` (only for the notifications badge read), new `bookings/statusMeta.ts`, `ModalShell.tsx`, `AppSidebar.tsx`, `AdminLayout.tsx`, one new SQL migration.

### Out of scope for this step

- Drag-to-reschedule (deferred previously).
- Actual email sending / edge function / SMTP config (next step, per your message).
- Customer-facing notification preferences UI (can follow after SMTP is live).
