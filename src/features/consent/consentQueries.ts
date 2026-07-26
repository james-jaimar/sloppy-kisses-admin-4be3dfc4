import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";

export type ConsentCustomer = {
  id: string;
  tenant_id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  mobile: string | null;
  address_line_1: string | null;
  suburb: string | null;
  city: string | null;
  id_number: string | null;
  employer: string | null;
  emergency_contact_name: string | null;
  emergency_contact_mobile: string | null;
  emergency_contact_relationship: string | null;
  vet_clinic_name: string | null;
  vet_clinic_contact: string | null;
  vet_clinic_address: string | null;
};

export type TermsVersion = {
  id: string;
  kind: string;
  version: string;
  title: string | null;
  body_markdown: string | null;
  effective_from: string;
};

export type ConsentStatus = {
  customer: ConsentCustomer | null;
  currentVersions: TermsVersion[];
  acceptedVersionIds: Set<string>;
  missingFields: string[];
  needsWizard: boolean;
};

const REQUIRED_FIELDS: (keyof ConsentCustomer)[] = [
  "mobile",
  "address_line_1",
  "suburb",
  "city",
  "id_number",
  "emergency_contact_name",
  "emergency_contact_mobile",
  "emergency_contact_relationship",
  "vet_clinic_name",
  "vet_clinic_contact",
];

export function useConsentStatus() {
  const { profile } = useCurrentUser();
  return useQuery({
    queryKey: ["consent_status", profile?.id],
    enabled: !!profile?.id && profile.user_type === "customer",
    queryFn: async (): Promise<ConsentStatus> => {
      const { data: cust, error: e1 } = await supabase
        .from("customers")
        .select(
          "id, tenant_id, first_name, last_name, full_name, mobile, address_line_1, suburb, city, id_number, employer, emergency_contact_name, emergency_contact_mobile, emergency_contact_relationship, vet_clinic_name, vet_clinic_contact, vet_clinic_address",
        )
        .eq("linked_profile_id", profile!.id)
        .eq("portal_access_enabled", true)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (e1) throw e1;
      const customer = (cust ?? null) as ConsentCustomer | null;
      if (!customer) {
        return {
          customer: null,
          currentVersions: [],
          acceptedVersionIds: new Set(),
          missingFields: [],
          needsWizard: false,
        };
      }

      const { data: versions, error: e2 } = await supabase
        .from("tenant_terms_versions")
        .select("id, kind, version, title, body_markdown, effective_from")
        .eq("tenant_id", customer.tenant_id)
        .eq("is_current", true);
      if (e2) throw e2;
      const currentVersions = (versions ?? []) as TermsVersion[];

      const versionIds = currentVersions.map((v) => v.id);
      let accepted: Set<string> = new Set();
      if (versionIds.length > 0) {
        const { data: consents, error: e3 } = await supabase
          .from("customer_consents")
          .select("version_id")
          .eq("customer_id", customer.id)
          .in("version_id", versionIds);
        if (e3) throw e3;
        accepted = new Set((consents ?? []).map((c: { version_id: string }) => c.version_id));
      }

      const missingFields = REQUIRED_FIELDS.filter(
        (k) => !customer[k] || String(customer[k]).trim() === "",
      ).map(String);

      const outstandingConsents = currentVersions.filter((v) => !accepted.has(v.id));
      const needsWizard = outstandingConsents.length > 0 || missingFields.length > 0;

      return {
        customer,
        currentVersions,
        acceptedVersionIds: accepted,
        missingFields,
        needsWizard,
      };
    },
  });
}