# Yoco payments: front desk and shop

## Outcome
Give the ladies clear payment buttons on invoices and at the till, send the chosen amount to Yoco, and record payment only after Yoco confirms success. Start in test mode; keep ordinary cash, EFT and manual card recording available.

## Important correction and dependency
Yoco **does** publish a Web POS API, but it is separate from online Checkout. Web POS requires an OAuth application with `business/webpos:read` and `business/webpos:write`; an online `sk_test_…` key alone is not sufficient. The Web POS response opens Yoco's payment session for terminal selection/confirmation, so we must not promise that clicking our button immediately wakes a particular machine without merchant input.

James has identified the machine as **Khumo**. Its exact variant and compatibility still need checking: Yoco's help page specifically mentions **Khumo Print by request** and **Neo Touch**, not every Khumo. Online test card details are for online checkout unless Yoco confirms otherwise; physical-terminal testing is a separate gate.

Build the independent screens and safeguards first. Hold terminal activation until access and compatibility are verified. Do not silently substitute online checkout for the requested terminal experience or build a native mobile bridge.

## Slice 1 — fast payment buttons
- Replace the invoice payment-method dropdown with clear icon-and-label buttons using the active methods from existing Payment Methods settings.
- Present Cash, EFT, manual Card and manual Yoco where configured; label **Yoco terminal** separately so recording a machine payment manually cannot be mistaken for charging a card.
- Align shop tender buttons and invoice/front-desk payment entry points. Preserve dates, references, notes, customer credit and allocation across invoices.
- Default connected payments to the current outstanding balance; allow an explicit smaller amount. Disabled/unconfigured terminal payments must not fall through to manual recording.
- Verify method selection and unchanged manual payment behaviour on desktop and tablet/mobile.

## Slice 2 — test connection and counter setup
- Extend Admin → Settings → Payment providers → Yoco with separate connection state, test/live environment, terminal compatibility and enabled state.
- Keep the owner in control; staff taking payments see only safe connection status, never credentials.
- Provide the supported Yoco authorisation flow, connection check and named Web POS counter registration. A counter ID represents a station/browser, not a terminal serial number.
- Show the required callback address and requested access before authorisation. Confirm exact Khumo variant and terminal selection through Yoco's session.
- Keep online Checkout credentials visibly separate if supplied; do not claim they activate Web POS or add an unrelated online payment flow without approval.
- Completion gate: sandbox access confirmed, counter registered, compatible-terminal route established. If access is missing, complete the screens and report the precise outstanding Yoco requirement.

## Slice 3 — safe payment processing
- Persist each attempt before contacting Yoco: tenant, staff member, counter, environment, intended amount, invoice/sale and allocation snapshot.
- Calculate/validate payable amounts on the server from current balances and persisted sale details; send integer ZAR cents, not browser-supplied totals alone.
- Prevent simultaneous duplicate requests and reuse/recover the same attempt after double-clicks, refreshes and interrupted responses.
- Fetch the result from Yoco on the server. A browser return, closed window or waiting timeout never proves payment success or failure.
- On verified success, record one payment and its allocations atomically using the existing billing lifecycle; retain Yoco's reference and the internal `yoko` method for existing accounting compatibility.
- Pending/unknown outcomes remain recoverable and block a fresh charge until reconciled. Only an authoritative failed outcome permits an ordinary retry; do not promise a remote cancellation endpoint without documented support.
- Isolate sandbox outcomes from real invoice balances, stock, customer receipts and Xero pushes. Use clearly marked test fixtures/dry-run state and keep existing live/manual payments untouched.

## Slice 4 — invoice and front-desk terminal flow
- Selecting Yoco terminal shows the amount and counter, then a clear **Send to Yoco** action.
- Open the supported Yoco session; show waiting, successful, failed and still-checking states, plus recovery after closing/reloading.
- Confirm partial and full payments, including allocation across the customer's selected invoices. Refresh balances/status only after server-confirmed recording.
- Keep manual Card/Yoco fallback explicit and separate; never switch methods automatically while an attempt is unresolved.
- Verification gate: a real authorised staff session starts a test payment and reads the outcome back through the invoice screen.

## Slice 5 — shop/till terminal flow
- Use the same Yoco payment experience for walk-in and named-customer sales, including a service invoice plus retail items in one total.
- Persist/freeze the payable basket before charging, preserving invoice lines, VAT, discounts and any existing balances. Do not rely on a browser-only basket after card approval.
- Support split cash/card payments and charge only the remaining Yoco portion.
- Finalise the sale exactly once after confirmed payment; prevent duplicate stock movements and payment rows. If finalisation fails after card approval, recover that sale without charging again.
- Retain the existing full bill preview, paid receipt queue and customer email opt-out. Never show a successful payment as merely an unsaved tender that can be deleted.
- Verification gate: test an existing invoice plus retail, a walk-in sale and a split payment; reload and confirm the persisted sale/payment/stock result.

## Slice 6 — verification and controlled go-live
- Test success, decline, interrupted session, duplicate clicks, reopened page, delayed success, changed balance, wrong tenant and unauthorised staff.
- Confirm correct cents conversion, partial-payment balances, single receipt, single sale/stock movement and the Yoco Xero account mapping. Do not enable Xero automatically or push sandbox data.
- Test with James's Yoco sandbox credentials using secure entry, then separately on the actual supported terminal with Kerry/Charlotte.
- Verify desktop/tablet/mobile presentation and callback/return links on the Amplify address and intended custom domain.
- Live activation remains off until James explicitly approves, live authorisation is verified and the physical-terminal check succeeds. Provide a short front-desk checklist and retain a manual fallback.

## Technical implementation
- Frontend scope: `RecordPaymentDialog`, shared payment selection/attempt UI, `TenderDialog`/POS flow, and `YocoSetupDialog`/Payment Providers settings. Reuse existing Button, modal and semantic theme patterns.
- Use authenticated Supabase Edge Functions for create/check/register/finalise operations with tenant and permission checks; use only credential-free status responses for normal payment staff. Apply required Supabase grants/RLS guidance before migrations.
- Keep tenant-owner credential management in Payment Providers, consistent with existing project policy. Audit current credential reads first; migrate Yoco sensitive values behind server-only storage and masked write/rotate operations rather than returning a settings object containing tokens to the browser. Keep non-secret counter/status metadata separate. No secrets in source, chat, local storage or logs.
- Follow Yoco's supported OAuth application approval and refresh lifecycle; verify callback state and tenant binding. Deploy any needed callback before requesting setup. Do not request keys until the correct access type is established.
- Web POS endpoints: `POST /v1/webpos/`, `POST /v1/webpos/{id}/payments`, `GET /v1/webpos/{id}/payments/{payment_id}`. Production host `https://api.yoco.com`; sandbox `https://api.yocosandbox.com`. Request money shape: `{ amount: integerCents, currency: "ZAR" }`. Provider statuses: `pending`, `successful`, `failed`.
- Adapt the existing `payment_attempts`, allocation and atomic POS mechanisms instead of introducing parallel invoice or receipt systems. Add durable sale preparation/recovery where required by the current one-step `complete_pos_sale` flow.
- Use provider-supported idempotency only after verifying its endpoint contract, alongside database uniqueness/locking. Poll/reconcile server-side status; add webhooks only if the Web POS event contract is confirmed, with verified signatures and duplicate protection.
- Add focused rule tests beside existing tests and transaction/permission regressions. Run each slice's tests and relevant user flow before moving on; distinguish simulations from actual authorised Yoco/terminal checks.

## Delivery order
Proceed through all six slices after plan approval, without asking for routine reconfirmation between slices. Stop only the parts awaiting credentials, Yoco approval, physical device access or explicit live activation. Report completed slices and exact remaining blockers; do not call an untested connection ready.

## Sources checked 18 November 2026
- [Yoco scopes: Web POS is OAuth-only](https://developer.yoco.com/docs/api/authentication/scopes.md)
- [Register a Web POS counter](https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-device-v-1-webpos-post.md)
- [Create a Web POS payment](https://developer.yoco.com/api-reference/yoco-api/web-pos/create-web-pos-payment-v-1-webpos-webpos-device-id-payments-post.md)
- [Fetch payment outcome](https://developer.yoco.com/api-reference/yoco-api/web-pos/fetch-web-pos-payment-v-1-webpos-webpos-device-id-payments-payment-id-get.md)
- [Yoco help: supported SalonBridge machine integration](https://support.yoco.help/en/articles/670728-yoco-salonbridge-integration)
- [Online Checkout is separate](https://developer.yoco.com/online/api-reference/checkout/payments/accept-payments/)