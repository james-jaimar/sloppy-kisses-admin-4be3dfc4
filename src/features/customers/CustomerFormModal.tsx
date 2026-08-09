import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCreateCustomer, useUpdateCustomer, useCustomerEmailLookup, type CustomerRow } from "./queries";
import { Link } from "react-router-dom";
import AddressField from "@/components/address/AddressField";
import { useCustomerAddresses } from "./addressQueries";

type Status = "active" | "inactive" | "archived";

interface Props {
  tenantId: string;
  customer?: CustomerRow | null; // present = edit, absent = create
  onClose: () => void;
  onCreated?: (id: string) => void;
  onSaved?: () => void;
}

interface FormState {
  first_name: string;
  last_name: string;
  full_name: string;
  email: string;
  mobile: string;
  phone_alt: string;
  address_line_1: string;
  address_line_2: string;
  suburb: string;
  city: string;
  province: string;
  postcode: string;
  formatted_address: string;
  google_place_id: string;
  latitude: number | null;
  longitude: number | null;
  access_notes: string;
  status: Status;
  notes_internal: string;
  id_number: string;
  employer: string;
  emergency_contact_name: string;
  emergency_contact_mobile: string;
  emergency_contact_relationship: string;
  vet_clinic_name: string;
  vet_clinic_contact: string;
  vet_clinic_address: string;
}

function fromCustomer(c?: CustomerRow | null): FormState {
  return {
    first_name: c?.first_name ?? "",
    last_name: c?.last_name ?? "",
    full_name: c?.full_name ?? "",
    email: c?.email ?? "",
    mobile: c?.mobile ?? "",
    phone_alt: c?.phone_alt ?? "",
    address_line_1: c?.address_line_1 ?? "",
    address_line_2: c?.address_line_2 ?? "",
    suburb: c?.suburb ?? "",
    city: c?.city ?? "",
    province: c?.province ?? "",
    postcode: c?.postcode ?? "",
    // Street only — the unit / complex line lives in address_line_2.
    formatted_address:
      [c?.address_line_1, c?.suburb, c?.city, c?.province, c?.postcode].filter(Boolean).join(", ") ?? "",
    google_place_id: "",
    latitude: null,
    longitude: null,
    access_notes: "",
    status: (c?.status as Status) ?? "active",
    notes_internal: c?.notes_internal ?? "",
    id_number: (c as any)?.id_number ?? "",
    employer: (c as any)?.employer ?? "",
    emergency_contact_name: (c as any)?.emergency_contact_name ?? "",
    emergency_contact_mobile: (c as any)?.emergency_contact_mobile ?? "",
    emergency_contact_relationship: (c as any)?.emergency_contact_relationship ?? "",
    vet_clinic_name: (c as any)?.vet_clinic_name ?? "",
    vet_clinic_contact: (c as any)?.vet_clinic_contact ?? "",
    vet_clinic_address: (c as any)?.vet_clinic_address ?? "",
  };
}

export function CustomerFormModal({ tenantId, customer, onClose, onCreated, onSaved }: Props) {
  const isEdit = Boolean(customer);
  const [form, setForm] = useState<FormState>(() => fromCustomer(customer));
  const [fullNameTouched, setFullNameTouched] = useState(Boolean(customer?.full_name));
  const create = useCreateCustomer(tenantId);
  const update = useUpdateCustomer(tenantId);
  const emailDupes = useCustomerEmailLookup(tenantId, form.email, customer?.id);
  const { data: existingAddresses } = useCustomerAddresses(customer?.id, tenantId);

  // Seed verification status from the customer's primary saved address.
  useEffect(() => {
    const primary = existingAddresses?.find((a) => a.is_primary) ?? existingAddresses?.[0];
    if (!primary) return;
    setForm((f) => ({
      ...f,
      formatted_address: f.formatted_address || primary.formatted_address || "",
      google_place_id: f.google_place_id || primary.google_place_id || "",
      latitude: f.latitude ?? primary.latitude ?? null,
      longitude: f.longitude ?? primary.longitude ?? null,
      address_line_2: f.address_line_2 || primary.address_line_2 || "",
      access_notes: f.access_notes || primary.access_notes || "",
    }));
  }, [existingAddresses]);

  // Auto-generate full_name from first/last if the user hasn't touched it
  useEffect(() => {
    if (fullNameTouched) return;
    const generated = [form.first_name, form.last_name].filter(Boolean).join(" ").trim();
    setForm((f) => ({ ...f, full_name: generated }));
  }, [form.first_name, form.last_name, fullNameTouched]);

  const busy = create.isPending || update.isPending;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload: any = {
      first_name: form.first_name.trim() || null,
      last_name: form.last_name.trim() || null,
      full_name:
        form.full_name.trim() ||
        [form.first_name, form.last_name].filter(Boolean).join(" ").trim() ||
        "Unnamed",
      email: form.email.trim() || null,
      mobile: form.mobile.trim() || null,
      phone_alt: form.phone_alt.trim() || null,
      address_line_1: form.address_line_1.trim() || null,
      address_line_2: form.address_line_2.trim() || null,
      suburb: form.suburb.trim() || null,
      city: form.city.trim() || null,
      province: form.province.trim() || null,
      postcode: form.postcode.trim() || null,
      _address: {
        address_line_1: form.address_line_1.trim() || null,
        address_line_2: form.address_line_2.trim() || null,
        suburb: form.suburb.trim() || null,
        city: form.city.trim() || null,
        province: form.province.trim() || null,
        postcode: form.postcode.trim() || null,
        formatted_address: form.formatted_address.trim() || null,
        google_place_id: form.google_place_id || null,
        latitude: form.latitude,
        longitude: form.longitude,
        access_notes: form.access_notes.trim() || null,
      },
      status: form.status,
      notes_internal: form.notes_internal.trim() || null,
      id_number: form.id_number.trim() || null,
      employer: form.employer.trim() || null,
      emergency_contact_name: form.emergency_contact_name.trim() || null,
      emergency_contact_mobile: form.emergency_contact_mobile.trim() || null,
      emergency_contact_relationship: form.emergency_contact_relationship.trim() || null,
      vet_clinic_name: form.vet_clinic_name.trim() || null,
      vet_clinic_contact: form.vet_clinic_contact.trim() || null,
      vet_clinic_address: form.vet_clinic_address.trim() || null,
    };

    if (!payload.first_name && !payload.last_name && payload.full_name === "Unnamed") {
      toast.error("Please enter at least a name.");
      return;
    }

    try {
      if (isEdit && customer) {
        await update.mutateAsync({ id: customer.id, patch: payload });
        toast.success("Customer updated");
        onSaved?.();
        onClose();
      } else {
        const created = await create.mutateAsync(payload);
        toast.success(`Customer ${created.customer_number} created`);
        onCreated?.(created.id);
        onClose();
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save customer");
    }
  }

  return (
    <ModalShell
      wide
      title={isEdit ? "Edit customer" : "Add customer"}
      subtitle={
        isEdit
          ? customer?.customer_number
            ? `Customer #${customer.customer_number}`
            : undefined
          : "A new customer number will be assigned automatically."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6 p-6">
        {isEdit && customer?.customer_number && (
          <Field label="Customer number">
            <input
              value={customer.customer_number}
              readOnly
              disabled
              className="h-10 w-full cursor-not-allowed rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground"
            />
          </Field>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="First name">
            <Input value={form.first_name} onChange={(v) => set("first_name", v)} />
          </Field>
          <Field label="Last name">
            <Input value={form.last_name} onChange={(v) => set("last_name", v)} />
          </Field>
        </div>
        <Field label="Full name" hint="Defaults to first + last name.">
          <Input
            value={form.full_name}
            onChange={(v) => {
              setFullNameTouched(true);
              set("full_name", v);
            }}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(v) => set("email", v)} />
            {emailDupes.data && emailDupes.data.length > 0 && (
              <div className="mt-1 flex items-start gap-1.5 rounded-md bg-amber-50 px-2 py-1.5 text-xs text-amber-900">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-none" />
                <div>
                  Already used by{" "}
                  {emailDupes.data.map((d, i) => (
                    <span key={d.id}>
                      {i > 0 && ", "}
                      <Link
                        to={`/admin/customers/${d.id}`}
                        className="font-medium underline"
                        onClick={onClose}
                      >
                        {d.full_name ?? "customer"}
                        {d.customer_number ? ` (${d.customer_number})` : ""}
                      </Link>
                    </span>
                  ))}
                  .
                </div>
              </div>
            )}
          </Field>
          <Field label="Mobile">
            <Input value={form.mobile} onChange={(v) => set("mobile", v)} />
          </Field>
        </div>
        <Field label="Alternative phone">
          <Input value={form.phone_alt} onChange={(v) => set("phone_alt", v)} />
        </Field>
        <AddressField
          label="Address"
          value={form}
          onChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
        />
        <Field label="Status">
          <select
            value={form.status}
            onChange={(e) => set("status", e.target.value as Status)}
            className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          >
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="archived">Archived</option>
          </select>
        </Field>
        <div className="border-t border-border pt-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Registration details
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="SA ID / passport number">
              <Input value={form.id_number} onChange={(v) => set("id_number", v)} />
            </Field>
            <Field label="Employer / workplace">
              <Input value={form.employer} onChange={(v) => set("employer", v)} />
            </Field>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Emergency contact
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Name">
              <Input value={form.emergency_contact_name} onChange={(v) => set("emergency_contact_name", v)} />
            </Field>
            <Field label="Mobile">
              <Input value={form.emergency_contact_mobile} onChange={(v) => set("emergency_contact_mobile", v)} />
            </Field>
            <Field label="Relationship">
              <Input value={form.emergency_contact_relationship} onChange={(v) => set("emergency_contact_relationship", v)} />
            </Field>
          </div>
        </div>
        <div className="border-t border-border pt-4">
          <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Vet
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Clinic name">
              <Input value={form.vet_clinic_name} onChange={(v) => set("vet_clinic_name", v)} />
            </Field>
            <Field label="Clinic phone">
              <Input value={form.vet_clinic_contact} onChange={(v) => set("vet_clinic_contact", v)} />
            </Field>
          </div>
          <div className="mt-4">
            <Field label="Clinic address">
              <Input value={form.vet_clinic_address} onChange={(v) => set("vet_clinic_address", v)} />
            </Field>
          </div>
        </div>
        <Field label="Internal notes">
          <textarea
            value={form.notes_internal}
            onChange={(e) => set("notes_internal", e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Create customer"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium">{label}</div>
      {children}
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </label>
  );
}

function Input({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
    />
  );
}