import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2, MapPin, Pencil } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";
import StaticMapThumb from "@/components/address/StaticMapThumb";
import AddressFormDrawer from "@/features/customers/AddressFormDrawer";
import {
  useCustomerAddresses,
  useCreateCustomerAddress,
  useUpdateCustomerAddress,
  type CustomerAddressRow,
} from "@/features/customers/addressQueries";

export default function MyProfilePage() {
  const cust = useCurrentCustomer();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", mobile: "", phone_alt: "",
    notify_email: true,
    notify_sms: true,
    notify_whatsapp: false,
  });
  const [addressDrawer, setAddressDrawer] = useState<null | { address: CustomerAddressRow | null }>(null);

  const addressesQ = useCustomerAddresses(cust.data?.id ?? null, cust.data?.tenant_id ?? null);
  const createAddress = useCreateCustomerAddress(cust.data?.tenant_id ?? null, cust.data?.id ?? null);
  const updateAddress = useUpdateCustomerAddress(cust.data?.tenant_id ?? null, cust.data?.id ?? null);
  const addresses = addressesQ.data ?? [];
  const primary = addresses.find((a) => a.is_primary) ?? addresses[0] ?? null;

  useEffect(() => {
    if (cust.data) {
      setForm({
        first_name: cust.data.first_name ?? "",
        last_name: cust.data.last_name ?? "",
        email: cust.data.email ?? "",
        mobile: cust.data.mobile ?? "",
        phone_alt: cust.data.phone_alt ?? "",
        notify_email: cust.data.notify_email ?? true,
        notify_sms: cust.data.notify_sms ?? true,
        notify_whatsapp: cust.data.notify_whatsapp ?? false,
      });
    }
  }, [cust.data]);

  const save = useMutation({
    mutationFn: async () => {
      if (!cust.data) return;
      const full = [form.first_name, form.last_name].filter(Boolean).join(" ").trim();
      const { error } = await supabase
        .from("customers")
        .update({ ...form, full_name: full || null } as any)
        .eq("id", cust.data.id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Profile updated"); qc.invalidateQueries({ queryKey: ["portal_current_customer"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed to save"),
  });

  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!cust.data) return <div className="p-6 text-sm text-muted-foreground">No profile linked.</div>;

  return (
    <>
      <AppHeader title="Profile" subtitle="Contact details and preferences"
        actions={<Link to="/customer/profile/password" className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm hover:bg-muted"><KeyRound className="h-4 w-4" /> Change password</Link>}
      />
      <div className="flex-1 p-6">
        <div className="sk-card space-y-4 p-6">
          <div className="grid gap-3 md:grid-cols-2">
            <Input label="First name" value={form.first_name} onChange={(v) => setForm({ ...form, first_name: v })} />
            <Input label="Last name" value={form.last_name} onChange={(v) => setForm({ ...form, last_name: v })} />
            <Input label="Email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} type="email" />
            <Input label="Mobile" value={form.mobile} onChange={(v) => setForm({ ...form, mobile: v })} />
            <Input label="Alt phone" value={form.phone_alt} onChange={(v) => setForm({ ...form, phone_alt: v })} />
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <div className="text-xs font-semibold uppercase text-muted-foreground">Home address</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  We use this for mobile grooming and pickups, so it needs to match the map.
                </p>
              </div>
              <Link to="/customer/addresses" className="text-xs font-semibold text-sk-coral hover:underline">
                Manage addresses
              </Link>
            </div>

            {primary ? (
              <div className="mt-3 flex items-start gap-3 rounded-lg border border-border bg-white p-3">
                <StaticMapThumb latitude={primary.latitude} longitude={primary.longitude} size={56} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{primary.label || "Home"}</div>
                  <p className="truncate text-sm text-muted-foreground">
                    {primary.formatted_address ||
                      [primary.address_line_1, primary.suburb, primary.city].filter(Boolean).join(", ")}
                  </p>
                  {!primary.google_place_id && (
                    <p className="mt-1 text-xs text-amber-700">
                      Not pinned on the map yet — please confirm it so our vans can find you.
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setAddressDrawer({ address: primary })}
                  className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold hover:bg-muted"
                >
                  <Pencil className="h-3.5 w-3.5" /> {primary.google_place_id ? "Edit" : "Confirm"}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setAddressDrawer({ address: null })}
                className="mt-3 inline-flex items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2 text-sm font-medium hover:bg-muted"
              >
                <MapPin className="h-4 w-4" /> Add your address
              </button>
            )}
          </div>

          <div className="rounded-xl border border-border p-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Notifications</div>
            <p className="mt-1 text-xs text-muted-foreground">Choose the channels we can use to reach you about bookings, invoices and vaccination reminders.</p>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.checked })} />
                Email {form.email ? <span className="text-xs text-muted-foreground">({form.email})</span> : null}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.notify_sms} onChange={(e) => setForm({ ...form, notify_sms: e.target.checked })} />
                SMS {form.mobile ? <span className="text-xs text-muted-foreground">({form.mobile})</span> : null}
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.notify_whatsapp} onChange={(e) => setForm({ ...form, notify_whatsapp: e.target.checked })} />
                WhatsApp {form.mobile ? <span className="text-xs text-muted-foreground">({form.mobile})</span> : null}
              </label>
            </div>
          </div>
          <div className="flex justify-end">
            <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>

      {cust.data && addressDrawer && (
        <AddressFormDrawer
          tenantId={cust.data.tenant_id}
          customerId={cust.data.id}
          address={addressDrawer.address}
          allowManual={false}
          saving={createAddress.isPending || updateAddress.isPending}
          onClose={() => setAddressDrawer(null)}
          onSave={async (values) => {
            if (addressDrawer.address) {
              await updateAddress.mutateAsync({ id: addressDrawer.address.id, patch: values as any });
            } else {
              await createAddress.mutateAsync({ ...values, is_primary: true } as any);
            }
            toast.success("Address saved");
            setAddressDrawer(null);
          }}
        />
      )}
    </>
  );
}

function Input({ label, value, onChange, type = "text" }: { label: string; value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase text-muted-foreground">{label}</div>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
    </label>
  );
}