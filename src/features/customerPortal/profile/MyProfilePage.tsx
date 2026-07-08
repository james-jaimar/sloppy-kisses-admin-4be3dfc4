import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Loader2 } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { supabase } from "@/lib/supabase/client";
import { useCurrentCustomer } from "../hooks";

export default function MyProfilePage() {
  const cust = useCurrentCustomer();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    first_name: "", last_name: "", email: "", mobile: "", phone_alt: "",
    address_line_1: "", address_line_2: "", suburb: "", city: "", province: "", postcode: "",
    notify_email: true,
  });

  useEffect(() => {
    if (cust.data) {
      setForm({
        first_name: cust.data.first_name ?? "",
        last_name: cust.data.last_name ?? "",
        email: cust.data.email ?? "",
        mobile: cust.data.mobile ?? "",
        phone_alt: cust.data.phone_alt ?? "",
        address_line_1: cust.data.address_line_1 ?? "",
        address_line_2: cust.data.address_line_2 ?? "",
        suburb: cust.data.suburb ?? "",
        city: cust.data.city ?? "",
        province: cust.data.province ?? "",
        postcode: cust.data.postcode ?? "",
        notify_email: cust.data.notify_email ?? true,
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
            <Input label="Address line 1" value={form.address_line_1} onChange={(v) => setForm({ ...form, address_line_1: v })} />
            <Input label="Address line 2" value={form.address_line_2} onChange={(v) => setForm({ ...form, address_line_2: v })} />
            <Input label="Suburb" value={form.suburb} onChange={(v) => setForm({ ...form, suburb: v })} />
            <Input label="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
            <Input label="Province" value={form.province} onChange={(v) => setForm({ ...form, province: v })} />
            <Input label="Postcode" value={form.postcode} onChange={(v) => setForm({ ...form, postcode: v })} />
          </div>
          <div className="rounded-xl border border-border p-4">
            <div className="text-xs font-semibold uppercase text-muted-foreground">Notifications</div>
            <label className="mt-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.notify_email} onChange={(e) => setForm({ ...form, notify_email: e.target.checked })} />
              Email me booking, invoice and vaccination reminders
            </label>
          </div>
          <div className="flex justify-end">
            <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-lg bg-sk-coral px-5 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              {save.isPending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      </div>
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