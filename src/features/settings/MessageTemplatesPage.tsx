import { useMemo, useState } from "react";
import { Save, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useMessageTemplates, useUpsertMessageTemplate, useDeleteMessageTemplate, type MessageTemplate } from "@/features/comms/queries";
import { useConfirm } from "@/components/ui/confirm-dialog";

const EVENT_CODES = [
  "booking_created","booking_rescheduled","booking_cancelled","booking_status_changed",
  "booking_request_created","booking_request_status_changed",
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
  const templates = templatesQ.data ?? [];
  const selected = useMemo(() => templates.find((t) => t.id === selectedId) ?? templates[0] ?? null, [templates, selectedId]);

  const [draft, setDraft] = useState<Partial<MessageTemplate>>({});
  const current: Partial<MessageTemplate> = { ...(selected ?? {}), ...draft };

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
            <Field label="Body" hint="Use {{customer.first_name}}, {{pet.name}}, {{booking.booking_number}}, {{invoice.number}} etc.">
              <textarea disabled={!canManage} rows={12} value={current.body ?? ""} onChange={(e) => setDraft({ ...draft, body: e.target.value })}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 font-mono text-xs" />
            </Field>

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