import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { withPaymentSync } from "./paymentSyncPolicy.ts";

Deno.test("disabled payment sync never reaches the provider", async () => {
  let calls = 0;
  const result = await withPaymentSync({ sync_payments: false }, async () => { calls++; return "sent"; });
  assertEquals(calls, 0);
  assertEquals(typeof result === "object" && result.skipped, true);
});

Deno.test("payment sync is off when an older settings record lacks the flag", async () => {
  let calls = 0;
  await withPaymentSync({}, async () => { calls++; });
  assertEquals(calls, 0);
});

Deno.test("explicit payment sync activation allows the provider call", async () => {
  let calls = 0;
  const result = await withPaymentSync({ sync_payments: true }, async () => { calls++; return "sent"; });
  assertEquals(calls, 1);
  assertEquals(result, "sent");
});