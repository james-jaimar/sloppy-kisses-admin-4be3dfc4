import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

export interface AddressSnapshot {
  address_line_1?: string | null;
  address_line_2?: string | null;
  suburb?: string | null;
  city?: string | null;
  province?: string | null;
  postcode?: string | null;
  country_code?: string | null;
  formatted_address?: string | null;
  google_place_id?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

function hasAnyText(a: AddressSnapshot) {
  return Boolean(
    (a.address_line_1 || a.suburb || a.city || a.formatted_address || "").toString().trim(),
  );
}

/**
 * Keep the customer's primary row in `customer_addresses` in step with the
 * legacy address columns edited on the customer record itself.
 */
export async function syncPrimaryCustomerAddress(
  tenantId: string,
  customerId: string,
  addr: AddressSnapshot,
) {
  if (!hasAnyText(addr)) return;

  const { data: existing, error: readErr } = await supabase
    .from("customer_addresses")
    .select("id")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .eq("is_primary", true)
    .maybeSingle();
  if (readErr) throw readErr;

  const payload = {
    address_line_1: addr.address_line_1 ?? null,
    address_line_2: addr.address_line_2 ?? null,
    suburb: addr.suburb ?? null,
    city: addr.city ?? null,
    province: addr.province ?? null,
    postcode: addr.postcode ?? null,
    country_code: addr.country_code ?? "ZA",
    formatted_address:
      addr.formatted_address ||
      [addr.address_line_1, addr.address_line_2, addr.suburb, addr.city, addr.province, addr.postcode]
        .filter(Boolean)
        .join(", "),
    google_place_id: addr.google_place_id ?? null,
    latitude: addr.latitude ?? null,
    longitude: addr.longitude ?? null,
    verification_failed_at: null,
    verification_error: null,
  };

  if (existing?.id) {
    const { error } = await supabase.from("customer_addresses").update(payload).eq("id", existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase.from("customer_addresses").insert({
      ...payload,
      tenant_id: tenantId,
      customer_id: customerId,
      label: "Home",
      address_type: "home",
      is_primary: true,
    } as any);
    if (error) throw error;
  }
}

async function callBackfill(body: Record<string, unknown>) {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) throw new Error("Not signed in");
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/backfill-addresses`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Address verification failed");
  return json.result as {
    processed: number;
    updated: number;
    failed: number;
    errors: string[];
    remaining: number;
    totals: { total: number; verified: number; unverified: number; failedFlagged: number };
  };
}

export { callBackfill };

/** Verify a single saved address with Google, on demand. */
export function useVerifyAddress(tenantId?: string | null, customerId?: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (addressId: string) => {
      const result = await callBackfill({ address_id: addressId });
      if (result.updated === 0) {
        throw new Error(result.errors[0]?.split(": ").slice(1).join(": ") || "Google could not match this address");
      }
      return result;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["customer_addresses", tenantId, customerId] });
      qc.invalidateQueries({ queryKey: ["customer_addresses"] });
    },
  });
}