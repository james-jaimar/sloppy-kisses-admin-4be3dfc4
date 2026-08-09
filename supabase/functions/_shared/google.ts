// Shared Google Maps Platform helpers.
//
// Deliberately NOT using the Lovable Google Maps connector — all access uses
// this project's own Google Cloud credentials so the app stays portable when
// hosting moves off Lovable (AWS Amplify).
//
// Secrets expected in Supabase Edge Function settings:
//   GOOGLE_MAPS_SERVER_KEY   — API key, application restriction "None",
//                              API-restricted to Routes / Places (New) / Geocoding
//   GOOGLE_ROUTING_SA_JSON   — service account JSON (whole file, one line)
//   GOOGLE_CLOUD_PROJECT_ID  — e.g. "sloppy-kisses-maps-123456"

export const ROUTES_HOST = "https://routes.googleapis.com";
export const PLACES_HOST = "https://places.googleapis.com";
export const GEOCODE_HOST = "https://maps.googleapis.com";
export const ROUTE_OPT_HOST = "https://routeoptimization.googleapis.com";

export function serverKey(): string {
  const k = Deno.env.get("GOOGLE_MAPS_SERVER_KEY") ?? Deno.env.get("GOOGLE_API_KEY");
  if (!k) throw new Error("GOOGLE_MAPS_SERVER_KEY (or GOOGLE_API_KEY) is not configured");
  return k;
}

export function projectId(): string {
  const p = Deno.env.get("GOOGLE_CLOUD_PROJECT_ID");
  if (!p) throw new Error("GOOGLE_CLOUD_PROJECT_ID is not configured");
  return p;
}

/** Turn a non-OK Google response into a readable error, preserving status + body. */
export async function googleError(res: Response, label: string): Promise<Error> {
  const body = await res.text();
  let reason = "";
  try {
    const details = JSON.parse(body)?.error?.details ?? [];
    reason = details.find((d: any) => d?.reason)?.reason ?? "";
  } catch { /* body wasn't JSON */ }
  const hint =
    reason === "API_KEY_HTTP_REFERRER_BLOCKED"
      ? " — the server key still has HTTP-referrer restrictions; set its application restriction to None or IP addresses."
      : reason === "API_KEY_SERVICE_BLOCKED"
        ? " — this API is not on the server key's allowed-APIs list."
        : "";
  return new Error(`${label} failed [${res.status}]${hint}: ${body}`);
}

// ---------- Service account OAuth (Route Optimization needs OAuth, not a key) ----------

interface ServiceAccount {
  client_email: string;
  private_key: string;
  token_uri?: string;
  project_id?: string;
}

function loadServiceAccount(): ServiceAccount {
  const raw = Deno.env.get("GOOGLE_ROUTING_SA_JSON");
  if (!raw) throw new Error("GOOGLE_ROUTING_SA_JSON is not configured");
  let sa: ServiceAccount;
  try {
    sa = JSON.parse(raw);
  } catch {
    throw new Error("GOOGLE_ROUTING_SA_JSON is not valid JSON — paste the whole key file contents");
  }
  if (!sa.client_email || !sa.private_key) {
    throw new Error("GOOGLE_ROUTING_SA_JSON is missing client_email or private_key");
  }
  // Some paste paths turn real newlines into the two characters \n.
  sa.private_key = sa.private_key.replace(/\\n/g, "\n");
  return sa;
}

function b64url(bytes: Uint8Array | string): string {
  const buf = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function pemToPkcs8(pem: string): Uint8Array {
  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");
  const bin = atob(body);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

let cachedToken: { token: string; expiresAt: number } | null = null;

/** OAuth access token for the routing service account (cloud-platform scope). */
export async function routingAccessToken(): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedToken.expiresAt - 60 > now) return cachedToken.token;

  const sa = loadServiceAccount();
  const tokenUri = sa.token_uri ?? "https://oauth2.googleapis.com/token";
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(JSON.stringify({
    iss: sa.client_email,
    scope: "https://www.googleapis.com/auth/cloud-platform",
    aud: tokenUri,
    iat: now,
    exp: now + 3600,
  }));
  const signingInput = `${header}.${claims}`;

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pemToPkcs8(sa.private_key),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(signingInput)),
  );
  const assertion = `${signingInput}.${b64url(sig)}`;

  const res = await fetch(tokenUri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw await googleError(res, "Service account token exchange");
  const json = await res.json();
  cachedToken = { token: json.access_token, expiresAt: now + Number(json.expires_in ?? 3600) };
  return cachedToken.token;
}

// ---------- Routes API ----------

export interface LatLng { latitude: number; longitude: number }

/** Route Optimization requires whole-second RFC3339 timestamps (`nanos` must be unset). */
export function rfc3339Seconds(ms: number | Date): string {
  const d = ms instanceof Date ? ms : new Date(ms);
  return `${new Date(Math.floor(d.getTime() / 1000) * 1000).toISOString().slice(0, 19)}Z`;
}

/** Travel seconds + metres between every origin and destination pair. */
export async function computeRouteMatrix(
  origins: LatLng[],
  destinations: LatLng[],
): Promise<Array<{ originIndex: number; destinationIndex: number; duration?: string; distanceMeters?: number; condition?: string }>> {
  const wrap = (p: LatLng) => ({ waypoint: { location: { latLng: p } } });
  const res = await fetch(`${ROUTES_HOST}/distanceMatrix/v2:computeRouteMatrix`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": serverKey(),
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,condition",
    },
    body: JSON.stringify({
      origins: origins.map(wrap),
      destinations: destinations.map(wrap),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_AWARE",
    }),
  });
  if (!res.ok) throw await googleError(res, "Routes computeRouteMatrix");
  return await res.json();
}

// ---------- Route Optimization ----------

/** Raw optimizeTours call. Caller builds the model; this handles auth + errors. */
export async function optimizeTours(model: Record<string, unknown>): Promise<any> {
  const token = await routingAccessToken();
  const res = await fetch(
    `${ROUTE_OPT_HOST}/v1/projects/${projectId()}:optimizeTours`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ model }),
    },
  );
  if (!res.ok) throw await googleError(res, "Route Optimization optimizeTours");
  return await res.json();
}