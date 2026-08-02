import { useMemo, useState } from "react";
import { Save, Plus, Trash2, Send, Eye, Pencil } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useMessageTemplates, useUpsertMessageTemplate, useDeleteMessageTemplate, type MessageTemplate } from "@/features/comms/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { supabase } from "@/lib/supabase/client";
import { buildSampleContext, getVariablesFor, renderTemplate } from "@/features/comms/templateVariables";

const EVENT_CODES = [
  "booking_created","booking_reminder_24h","booking_rescheduled","booking_cancelled","booking_status_changed",
  "invoice_issued","invoice_reminder","invoice_paid",
  "vax_expiring_30d","vax_expiring_7d","vax_expired","manual_message",
];

export default function MessageTemplatesPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const confirm = useConfirm();
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission("settings.comms.manage");
  const templatesQ = useMessageTemplates(tenantId);
  const upsert = useUpsertMessageTemplate(tenantId ?? "");
  const del = useDeleteMessageTemplate(tenantId ?? "");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [showVars, setShowVars] = useState(false);
  const [testing, setTesting] = useState(false);
  const templates = templatesQ.data ?? [];
  const selected = useMemo(() => templates.find((t) => t.id === selectedId) ?? templates[0] ?? null, [templates, selectedId]);

  const [draft, setDraft] = useState<Partial<MessageTemplate>>({});
  const current: Partial<MessageTemplate> = { ...(selected ?? {}), ...draft };
  const vars = getVariablesFor(current.event_code ?? null);
  const sampleCtx = useMemo(() => {
    const ctx = buildSampleContext(current.event_code ?? null);
    (ctx as any).tenant = { name: tenant?.name ?? "Sloppy Kisses" };
    return ctx;
  }, [current.event_code, tenant?.name]);
  const previewSubject = current.subject ? renderTemplate(current.subject, sampleCtx) : "";
  const previewBody = current.body ? renderTemplate(current.body, sampleCtx) : "";

  async function save() {
    if (!current.event_code || !current.channel || !current.name || !current.body) {
      toast.error("Event, channel, name, body required");
      return;
    }
    try {
      await upsert.mutateAsync({
        id: current.id,
        event_code: current.event_code,
        channel: current.channel as any,
        name: current.name,
        subject: current.subject ?? null,
        body: current.body,
        send_to: current.send_to ?? "customer",
        is_active: current.is_active ?? true,
        auto_send: current.auto_send ?? true,
      } as any);
      toast.success("Saved");
      setDraft({});
    } catch (e: any) { toast.error(e?.message); }
  }

  async function remove() {
    if (!selected?.id) return;
    if (!(await confirm({ title: `Delete template "${selected.name}"?`, confirmLabel: "Delete", tone: "destructive" }))) return;
    try { await del.mutateAsync(selected.id); toast.success("Deleted"); setSelectedId(null); setDraft({}); }
    catch (e: any) { toast.error(e?.message); }
  }

  async function sendTest() {
    if (!tenantId || !current.body) { toast.error("Body required"); return; }
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("notify-test-send", {
        body: {
          tenant_id: tenantId,
          event_code: current.event_code,
          subject: current.subject ?? "",
          body: current.body,
          sample: sampleCtx,
        },
      });
      if (error) throw error;
      toast.success(`Test sent to ${data?.recipient ?? "test recipient"}`);
    } catch (e: any) {
      toast.error(e?.message ?? "Test send failed");
    } finally {
      setTesting(false);
    }
  }

  function newTemplate() {
    setSelectedId(null);
    setDraft({ event_code: "manual_message", channel: "email", name: "New template", subject: "", body: "", send_to: "customer", is_active: true, auto_send: false });
  }

  return (
    <>
      <AppHeader title="Message templates" subtitle="Templates for automated and manual customer messages." />
      <div className="flex-1 p-6">
        <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
          <div className="sk-card p-3">
            <button disabled={!canManage} onClick={newTemplate}
              className="mb-2 inline-flex w-full items-center justify-center gap-1 rounded-lg bg-sk-coral px-3 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
              <Plus className="h-4 w-4" /> New template
            </button>
            <ul className="space-y-1">
              {templates.map((t) => (
                <li key={t.id}>
                  <button onClick={() => { setSelectedId(t.id); setDraft({}); }}
                    className={"w-full rounded-lg px-3 py-2 text-left text-sm " + (selected?.id === t.id ? "bg-sk-coral-soft text-sk-coral-dark" : "hover:bg-muted")}>
                    <div className="font-medium">{t.name}</div>
                    <div className="text-xs text-muted-foreground">{t.event_code} · {t.channel}</div>
                  </button>
                </li>
              ))}
              {!templates.length && <li className="p-4 text-xs text-muted-foreground">No templates yet.</li>}
            </ul>
          </div>

          <div className="sk-card space-y-4 p-6">
            {!canManage && (
              <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
                Read-only. Requires "Manage comms settings".
              </div>
            )}
            <div className="flex items-center justify-between gap-2 border-b border-border pb-3">
              <div className="inline-flex rounded-lg border border-border p-0.5 text-xs">
                <button onClick={() => setMode("edit")}
                  className={"inline-flex items-center gap-1 rounded-md px-3 py-1.5 " + (mode === "edit" ? "bg-sk-coral-soft text-sk-coral-dark font-semibold" : "text-muted-foreground hover:bg-muted")}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </button>
                <button onClick={() => setMode("preview")}
                  className={"inline-flex items-center gap-1 rounded-md px-3 py-1.5 " + (mode === "preview" ? "bg-sk-coral-soft text-sk-coral-dark font-semibold" : "text-muted-foreground hover:bg-muted")}>
                  <Eye className="h-3.5 w-3.5" /> Preview
                </button>
              </div>
              <button disabled={!canManage || testing || !current.body} onClick={sendTest}
                className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted disabled:opacity-50">
                <Send className="h-3.5 w-3.5" /> {testing ? "Sending…" : "Send test"}
              </button>
            </div>
            {mode === "preview" ? (
              <div className="space-y-3">
                <div className="rounded-lg border border-border bg-muted px-3 py-2 text-sm">
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Subject</div>
                  <div className="mt-1">{previewSubject || <span className="text-muted-foreground">(no subject — falls back to "{current.event_code} — {tenant?.name}")</span>}</div>
                </div>
                <div className="rounded-lg border border-border bg-white px-4 py-4 text-sm leading-relaxed whitespace-pre-wrap">
                  {previewBody || <span className="text-muted-foreground">(empty body)</span>}
                </div>
                <div className="text-[11px] text-muted-foreground">Preview uses sample data. Real sends fill in the customer's actual details.</div>
              </div>
            ) : (
            <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name">
                <input disabled={!canManage} value={current.name ?? ""} onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
              <Field label="Event">
                <select disabled={!canManage} value={current.event_code ?? ""} onChange={(e) => setDraft({ ...draft, event_code: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                  {EVENT_CODES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <Field label="Channel">
                <select disabled={!canManage} value={current.channel ?? "email"} onChange={(e) => setDraft({ ...draft, channel: e.target.value as any })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="sms">SMS</option>
                </select>
              </Field>
              <Field label="Send to">
                <select disabled={!canManage} value={current.send_to ?? "customer"} onChange={(e) => setDraft({ ...draft, send_to: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm">
                  <option value="customer">Customer</option>
                  <option value="internal">Internal</option>
                  <option value="both">Both</option>
                </select>
              </Field>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!canManage} checked={current.is_active ?? true} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} />
                Active
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" disabled={!canManage} checked={current.auto_send ?? true} onChange={(e) => setDraft({ ...draft, auto_send: e.target.checked })} />
                Send automatically
              </label>
            </div>
            {current.channel === "email" && (
              <Field label="Subject">
                <input disabled={!canManage} value={current.subject ?? ""} onChange={(e) => setDraft({ ...draft, subject: e.target.value })}
                  className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
              </Field>
            )}
            <Field label="Body" hint="Use variables like {{customer.full_name}}. Full list below.">
              <textarea disabled={!canManage} rows={12} value={current.body ?? ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs" />
            </Field>
            <div className="rounded-lg border border-border bg-muted/40">
              <button type="button" onClick={() => setShowVars((v) => !v)}
                className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Variables reference ({vars.length})
                <span>{showVars ? "−" : "+"}</span>
              </button>
              {showVars && (
                <ul className="space-y-1 border-t border-border px-3 py-2 text-xs">
                  {vars.map((v) => (
                    <li key={v.path} className="flex items-baseline justify-between gap-3">
                      <code className="rounded bg-white px-1.5 py-0.5 font-mono">{"{{"}{v.path}{"}}"}</code>
                      <span className="text-muted-foreground">{v.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            </>
            )}

            <div className="flex justify-between">
              {selected?.id ? (
                <button disabled={!canManage} onClick={remove}
                  className="inline-flex items-center gap-2 rounded-lg border border-sk-coral px-3 py-2 text-sm text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50">
                  <Trash2 className="h-4 w-4" /> Delete
                </button>
              ) : <div />}
              <button disabled={!canManage || upsert.isPending} onClick={save}
                className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50">
                <Save className="h-4 w-4" /> Save
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      {children}
      {hint && <div className="mt-1 text-[11px] text-muted-foreground">{hint}</div>}
    </label>
  );
}