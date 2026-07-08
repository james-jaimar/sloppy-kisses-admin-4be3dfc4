import { useEffect, useState } from "react";
import { Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useCommsSettings, useUpdateCommsSettings } from "@/features/comms/queries";

export default function CommsSettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("settings.comms.manage");
  const settingsQ = useCommsSettings(tenantId);
  const update = useUpdateCommsSettings(tenantId ?? "");

  const [form, setForm] = useState({
    from_name: "", from_email: "", reply_to: "", whatsapp_from: "", sms_from: "",
    quiet_start: "20:00", quiet_end: "07:00", timezone: "Africa/Johannesburg", test_recipient: "",
  });

  useEffect(() => {
    const d = settingsQ.data;
    if (d) {
      setForm({
        from_name: d.from_name ?? "",
        from_email: d.from_email ?? "",
        reply_to: d.reply_to ?? "",
        whatsapp_from: d.whatsapp_from ?? "",
        sms_from: d.sms_from ?? "",
        quiet_start: (d.quiet_start ?? "20:00").slice(0, 5),
        quiet_end: (d.quiet_end ?? "07:00").slice(0, 5),
        timezone: d.timezone ?? "Africa/Johannesburg",
        test_recipient: d.test_recipient ?? "",
      });
    }
  }, [settingsQ.data]);

  async function save() {
    try {
      await update.mutateAsync({
        from_name: form.from_name,
        from_email: form.from_email,
        reply_to: form.reply_to || null,
        whatsapp_from: form.whatsapp_from || null,
        sms_from: form.sms_from || null,
        quiet_start: form.quiet_start,
        quiet_end: form.quiet_end,
        timezone: form.timezone,
        test_recipient: form.test_recipient || null,
      } as any);
      toast.success("Saved");
    } catch (e: any) { toast.error(e?.message); }
  }

  return (
    <>
      <AppHeader title="Comms settings" subtitle="Sender identity, quiet hours, test sends." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-3xl space-y-6 p-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only. Requires "Manage comms settings".
            </div>
          )}
          <Section title="Email sender">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="From name">
                <Input disabled={!canManage} value={form.from_name} onChange={(v) => setForm({ ...form, from_name: v })} />
              </Field>
              <Field label="From email">
                <Input disabled={!canManage} value={form.from_email} onChange={(v) => setForm({ ...form, from_email: v })} />
              </Field>
              <Field label="Reply-to" className="sm:col-span-2">
                <Input disabled={!canManage} value={form.reply_to} onChange={(v) => setForm({ ...form, reply_to: v })} />
              </Field>
            </div>
          </Section>
          <Section title="WhatsApp / SMS (provider TBD)">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="WhatsApp sender number">
                <Input disabled={!canManage} value={form.whatsapp_from} onChange={(v) => setForm({ ...form, whatsapp_from: v })} />
              </Field>
              <Field label="SMS sender ID">
                <Input disabled={!canManage} value={form.sms_from} onChange={(v) => setForm({ ...form, sms_from: v })} />
              </Field>
            </div>
          </Section>
          <Section title="Quiet hours">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="No sends after"><Input type="time" disabled={!canManage} value={form.quiet_start} onChange={(v) => setForm({ ...form, quiet_start: v })} /></Field>
              <Field label="Resume at"><Input type="time" disabled={!canManage} value={form.quiet_end} onChange={(v) => setForm({ ...form, quiet_end: v })} /></Field>
              <Field label="Timezone"><Input disabled={!canManage} value={form.timezone} onChange={(v) => setForm({ ...form, timezone: v })} /></Field>
            </div>
          </Section>
          <Section title="Testing">
            <Field label="Test recipient" hint="Where the 'Test send' from Message Templates is delivered.">
              <Input disabled={!canManage} value={form.test_recipient} onChange={(v) => setForm({ ...form, test_recipient: v })} />
            </Field>
          </Section>
          <div className="flex justify-end">
            <button disabled={!canManage || update.isPending} onClick={save}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              <Save className="h-4 w-4" /> Save
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>{children}</div>;
}
function Field({ label, hint, className, children }: { label: string; hint?: string; className?: string; children: React.ReactNode }) {
  return <label className={"block " + (className ?? "")}><div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>{children}{hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}</label>;
}
function Input({ value, onChange, type = "text", disabled }: { value: string; onChange: (v: string) => void; type?: string; disabled?: boolean }) {
  return <input type={type} disabled={disabled} value={value} onChange={(e) => onChange(e.target.value)} className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />;
}