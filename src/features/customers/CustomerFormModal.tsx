import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCreateCustomer, useUpdateCustomer, type CustomerRow } from "./queries";

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
  status: Status;
  notes_internal: string;
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
    status: (c?.status as Status) ?? "active",
    notes_internal: c?.notes_internal ?? "",
  };
}

export function CustomerFormModal({ tenantId, customer, onClose, onCreated, onSaved }: Props) {
  const isEdit = Boolean(customer);
  const [form, setForm] = useState<FormState>(() => fromCustomer(customer));
  const [fullNameTouched, setFullNameTouched] = useState(Boolean(customer?.full_name));
  const create = useCreateCustomer(tenantId);
  const update = useUpdateCustomer(tenantId);

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
      status: form.status,
      notes_internal: form.notes_internal.trim() || null,
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
          </Field>
          <Field label="Mobile">
            <Input value={form.mobile} onChange={(v) => set("mobile", v)} />
          </Field>
        </div>
        <Field label="Alternative phone">
          <Input value={form.phone_alt} onChange={(v) => set("phone_alt", v)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Address line 1">
            <Input value={form.address_line_1} onChange={(v) => set("address_line_1", v)} />
          </Field>
          <Field label="Address line 2">
            <Input value={form.address_line_2} onChange={(v) => set("address_line_2", v)} />
          </Field>
          <Field label="Suburb">
            <Input value={form.suburb} onChange={(v) => set("suburb", v)} />
          </Field>
          <Field label="City">
            <Input value={form.city} onChange={(v) => set("city", v)} />
          </Field>
          <Field label="Province">
            <Input value={form.province} onChange={(v) => set("province", v)} />
          </Field>
          <Field label="Postal code">
            <Input value={form.postcode} onChange={(v) => set("postcode", v)} />
          </Field>
        </div>
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