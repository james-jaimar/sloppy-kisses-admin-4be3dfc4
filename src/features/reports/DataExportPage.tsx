import { useState } from "react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import {
  useCustomerExport,
  usePetExport,
  type CustomerExportRow,
  type PetExportRow,
} from "./queries";
import { Download, Loader2, Users, PawPrint } from "lucide-react";

const CUSTOMER_HEADERS: { key: keyof CustomerExportRow; label: string }[] = [
  { key: "sk_number", label: "SK number" },
  { key: "original_xero_name", label: "Original Xero name" },
  { key: "first_name", label: "First name" },
  { key: "last_name", label: "Last name" },
  { key: "full_name", label: "Full name" },
  { key: "email", label: "Email" },
  { key: "mobile", label: "Mobile" },
  { key: "phone_alt", label: "Alt phone" },
  { key: "address_line_1", label: "Address line 1" },
  { key: "address_line_2", label: "Address line 2" },
  { key: "suburb", label: "Suburb" },
  { key: "city", label: "City" },
  { key: "province", label: "Province" },
  { key: "postcode", label: "Postcode" },
  { key: "status", label: "Status" },
  { key: "customer_types", label: "Types" },
  { key: "pet_count", label: "Number of pets" },
  { key: "date_added", label: "Date added" },
];

const PET_HEADERS: { key: keyof PetExportRow; label: string }[] = [
  { key: "sp_number", label: "SP number" },
  { key: "pet_name", label: "Pet name" },
  { key: "species", label: "Species" },
  { key: "breed", label: "Breed" },
  { key: "size", label: "Size" },
  { key: "date_of_birth", label: "Date of birth" },
  { key: "owner_sk_number", label: "Owner SK number" },
  { key: "owner_name", label: "Owner name" },
  { key: "owner_email", label: "Owner email" },
  { key: "owner_mobile", label: "Owner mobile" },
];

function csvCell(v: unknown) {
  const s = v === null || v === undefined ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

function toCsv<T>(rows: T[], headers: { key: keyof T; label: string }[]) {
  const head = headers.map((h) => csvCell(h.label)).join(",");
  const body = rows.map((r) =>
    headers.map((h) => csvCell(r[h.key])).join(",")
  );
  // BOM so Excel opens accented names correctly
  return "\uFEFF" + [head, ...body].join("\r\n");
}

function download(filename: string, contents: string) {
  const blob = new Blob([contents], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

export default function DataExportPage() {
  const { tenant } = useCurrentTenant();
  const [activeOnly, setActiveOnly] = useState(true);

  const customersQ = useCustomerExport(tenant?.id ?? null, activeOnly);
  const petsQ = usePetExport(tenant?.id ?? null, activeOnly);

  const customers = customersQ.data ?? [];
  const pets = petsQ.data ?? [];
  const loading = customersQ.isLoading || petsQ.isLoading;
  const failed = customersQ.error || petsQ.error;

  const withXeroName = customers.filter((c) => !!c.original_xero_name).length;

  function downloadCustomers() {
    download(
      `sloppy-kisses-customers-${today()}.csv`,
      toCsv(customers, CUSTOMER_HEADERS)
    );
  }
  function downloadPets() {
    download(`sloppy-kisses-pets-${today()}.csv`, toCsv(pets, PET_HEADERS));
  }
  function downloadBoth() {
    downloadCustomers();
    setTimeout(downloadPets, 400);
  }

  return (
    <>
      <AppHeader
        title="Data export"
        subtitle="Download the customer and pet lists with their SK and SP numbers"
      />
      <div className="space-y-4 p-6">
        <div className="sk-card p-5">
          <div className="text-sm text-muted-foreground">
            These files contain every customer and pet with the number we gave
            them, alongside the original name each record came across with from
            Xero. Open them in Excel, or send them on so the SK numbers can be
            added against the matching records in Xero and the two systems line
            up.
          </div>
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={activeOnly}
              onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4 rounded border-border"
            />
            Only active customers
          </label>
        </div>

        {failed ? (
          <div className="sk-card p-5 text-sm text-destructive">
            We couldn't load the lists. You may not have permission to export
            data — ask an administrator to check your access.
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            <div className="sk-card p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                  <Users className="h-5 w-5" />
                </div>
                <div className="text-base font-semibold">Customers</div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Counting…
                  </span>
                ) : (
                  <>
                    {customers.length.toLocaleString("en-ZA")} customers,{" "}
                    {withXeroName.toLocaleString("en-ZA")} of them with their
                    original Xero name.
                  </>
                )}
              </div>
              <button
                onClick={downloadCustomers}
                disabled={loading || customers.length === 0}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Download customers
              </button>
            </div>

            <div className="sk-card p-5">
              <div className="flex items-center gap-3">
                <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                  <PawPrint className="h-5 w-5" />
                </div>
                <div className="text-base font-semibold">Pets</div>
              </div>
              <div className="mt-2 text-sm text-muted-foreground">
                {loading ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin" /> Counting…
                  </span>
                ) : (
                  <>
                    {pets.length.toLocaleString("en-ZA")} pets, each shown with
                    its owner's SK number.
                  </>
                )}
              </div>
              <button
                onClick={downloadPets}
                disabled={loading || pets.length === 0}
                className="mt-4 inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
              >
                <Download className="h-4 w-4" /> Download pets
              </button>
            </div>
          </div>
        )}

        {!failed && (
          <button
            onClick={downloadBoth}
            disabled={loading || (customers.length === 0 && pets.length === 0)}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            <Download className="h-4 w-4" /> Download both (one file per list)
          </button>
        )}
      </div>
    </>
  );
}
