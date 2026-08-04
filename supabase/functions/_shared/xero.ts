// Shared helpers for talking to Xero through the Lovable connector gateway.
// Never call api.xero.com directly — the gateway holds and refreshes the OAuth token.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/xero";

export type XeroCtx = { tenantId: string };

function keys() {
  const lovableKey = Deno.env.get("LOVABLE_API_KEY");
  const connKey = Deno.env.get("XERO_API_KEY");
  if (!lovableKey) throw new Error("LOVABLE_API_KEY is not configured");
  if (!connKey) throw new Error("XERO_API_KEY is not configured — connect Xero in project settings");
  return { lovableKey, connKey };
}

export async function xeroConnections(): Promise<Array<{ tenantId: string; tenantName: string; tenantType: string }>> {
  const { lovableKey, connKey } = keys();
  const res = await fetch(`${GATEWAY_URL}/connections`, {
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connKey,
      Accept: "application/json",
    },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Xero /connections failed [${res.status}]: ${text}`);
  try { return JSON.parse(text); } catch { throw new Error(`Xero /connections returned non-JSON: ${text}`); }
}

/** Call any Accounting API path, e.g. "Invoices" or "Contacts?where=..." */
export async function xero(
  ctx: XeroCtx,
  path: string,
  init: { method?: string; body?: unknown; retries?: number } = {},
): Promise<any> {
  const { lovableKey, connKey } = keys();
  const method = init.method ?? "GET";
  const maxRetries = init.retries ?? 3;

  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`${GATEWAY_URL}/api.xro/2.0/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": connKey,
        "xero-tenant-id": ctx.tenantId,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
      },
      body: init.body ? JSON.stringify(init.body) : undefined,
    });
    const text = await res.text();

    if (res.ok) {
      try { return text ? JSON.parse(text) : {}; } catch { return { raw: text }; }
    }

    // Xero throttles hard (60 calls/min, 5 concurrent) and 503s under load.
    const transient = res.status === 429 || res.status === 503 || res.status === 502;
    if (transient && attempt < maxRetries) {
      const retryAfter = Number(res.headers.get("Retry-After") ?? 0);
      const waitMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(2 ** attempt * 1500, 15_000);
      await sleep(waitMs);
      continue;
    }

    const err: any = new Error(`Xero ${method} ${path} failed [${res.status}]: ${text}`);
    err.status = res.status;
    err.body = text;
    err.retryAfter = Number(res.headers.get("Retry-After") ?? 0);
    throw err;
  }
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Xero allows ~60 calls/minute — keep a small gap between writes. */
export const pace = () => sleep(1100);

export const xeroDate = (d: string | null | undefined) => (d ? String(d).slice(0, 10) : undefined);
