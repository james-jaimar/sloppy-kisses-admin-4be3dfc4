import { useEffect, useState } from "react";
import { Save, Send } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { supabase } from "@/lib/supabase/client";

const PERMISSION = "settings.email.manage";

type Row = {
  provider: string;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: string;
  smtp_username: string | null;
  from_name: string | null;
  from_email: string | null;
  reply_to: string | null;
  has_password: boolean;
  last_test_at: string | null;
  last_test_ok: boolean | null;
  last_test_error: string | null;
};

export default function EmailServerSettingsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);

  const [row, setRow] = useState<Row | null>(null);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({
    smtp_host: "", smtp_port: 587 as number, smtp_secure: "starttls",
    smtp_username: "", smtp_password: "",
    from_name: "", from_email: "", reply_to: "",
  });
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testTo, setTestTo] = useState("");

  useEffect(() => {
    if (!tenantId || !supabase) return;
    setLoading(true);
    supabase.from("email_transport_settings_safe" as any)
      .select("*").eq("tenant_id", tenantId).maybeSingle()
      .then(({ data }) => {
        const r = (data as unknown) as Row | null;
        setRow(r);
        if (r) setForm({
          smtp_host: r.smtp_host ?? "",
          smtp_port: r.smtp_port ?? 587,
          smtp_secure: r.smtp_secure ?? "starttls",
          smtp_username: r.smtp_username ?? "",
          smtp_password: "",
          from_name: r.from_name ?? "",
          from_email: r.from_email ?? "",
          reply_to: r.reply_to ?? "",
        });
        setLoading(false);
      });
  }, [tenantId]);

  async function save() {
    if (!tenantId || !supabase) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke("email-settings-save", {
        body: { tenant_id: tenantId, ...form },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success("Email settings saved");
      // refresh
      const { data: fresh } = await supabase.from("email_transport_settings_safe" as any)
        .select("*").eq("tenant_id", tenantId).maybeSingle();
      setRow((fresh as unknown) as Row | null);
      setForm((f) => ({ ...f, smtp_password: "" }));
    } catch (e: any) { toast.error(e?.message ?? "Failed to save"); }
    finally { setSaving(false); }
  }

  async function sendTest() {
    if (!tenantId || !supabase || !testTo) return;
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-test-email", {
        body: { tenant_id: tenantId, to: testTo },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      toast.success(`Test email sent to ${testTo}`);
    } catch (e: any) { toast.error(e?.message ?? "Test send failed"); }
    finally { setTesting(false); }
  }

  return (
    <>
      <AppHeader title="Email server" subtitle="SMTP credentials used to send outbound mail." />
      <div className="flex-1 p-6">
        <div className="sk-card max-w-3xl p-6 space-y-6">
          {!canManage && (
            <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
              Read-only. You need the "Manage email server" permission to change settings.
            </div>
          )}

          {loading ? <div className="text-sm text-muted-foreground">Loading…</div> : (
            <>
              <Section title="SMTP server">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Host" hint="e.g. smtp.gmail.com">
                    <input disabled={!canManage} value={form.smtp_host} onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="Port">
                    <input type="number" disabled={!canManage} value={form.smtp_port}
                      onChange={(e) => setForm({ ...form, smtp_port: Number(e.target.value) })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="Encryption">
                    <select disabled={!canManage} value={form.smtp_secure}
                      onChange={(e) => setForm({ ...form, smtp_secure: e.target.value })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                      <option value="starttls">STARTTLS (port 587)</option>
                      <option value="ssl">SSL/TLS (port 465)</option>
                      <option value="none">None (unencrypted)</option>
                    </select>
                  </Field>
                  <Field label="Username">
                    <input disabled={!canManage} value={form.smtp_username}
                      onChange={(e) => setForm({ ...form, smtp_username: e.target.value })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="Password" hint={row?.has_password ? "Password is stored. Leave blank to keep." : "Not set."} className="sm:col-span-2">
                    <input type="password" disabled={!canManage} value={form.smtp_password}
                      placeholder={row?.has_password ? "••••••••" : ""}
                      onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                </div>
              </Section>

              <Section title="Sender identity">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="From name">
                    <input disabled={!canManage} value={form.from_name}
                      onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="From email">
                    <input disabled={!canManage} value={form.from_email}
                      onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <Field label="Reply-to (optional)" className="sm:col-span-2">
                    <input disabled={!canManage} value={form.reply_to}
                      onChange={(e) => setForm({ ...form, reply_to: e.target.value })}
                      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                </div>
              </Section>

              <div className="flex items-center justify-end gap-2">
                <button disabled={!canManage || saving} onClick={save}
                  className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                  <Save className="h-4 w-4" /> Save
                </button>
              </div>

              <Section title="Send test email">
                <div className="flex flex-wrap items-end gap-3">
                  <Field label="Recipient">
                    <input disabled={!canManage} value={testTo} onChange={(e) => setTestTo(e.target.value)}
                      placeholder="you@example.com"
                      className="h-10 w-72 rounded-lg border border-border bg-white px-3 text-sm" />
                  </Field>
                  <button disabled={!canManage || testing || !testTo} onClick={sendTest}
                    className="inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-white px-4 text-sm font-semibold hover:bg-muted disabled:opacity-50">
                    <Send className="h-4 w-4" /> Send test
                  </button>
                </div>
                {row?.last_test_at && (
                  <div className="mt-3 text-xs text-muted-foreground">
                    Last test: {new Date(row.last_test_at).toLocaleString()} —{" "}
                    {row.last_test_ok
                      ? <span className="text-sk-green">success</span>
                      : <span className="text-destructive">failed: {row.last_test_error}</span>}
                  </div>
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
      {children}
    </div>
  );
}
function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={"block " + (className ?? "")}>
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}