import { useMemo, useState } from "react";
import { format } from "date-fns";
import { Mail, MessageSquare, Send, AlertCircle, Inbox, CheckCircle2, ShieldCheck } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useNotificationEvents, useAuthEmailLog, type NotificationEvent } from "./queries";
import { CommsEventDrawer } from "./CommsEventDrawer";

const TABS = [
  { key: "pending", label: "Outbox", icon: Inbox },
  { key: "sent", label: "Sent", icon: CheckCircle2 },
  { key: "failed", label: "Failed", icon: AlertCircle },
  { key: "all", label: "All", icon: MessageSquare },
  { key: "auth", label: "Auth emails", icon: ShieldCheck },
] as const;

function channelIcon(ch: string | null) {
  if (ch === "whatsapp" || ch === "sms") return MessageSquare;
  return Mail;
}

export default function CommsInboxPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canView = hasPermission("comms.view");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");
  const [channel, setChannel] = useState<string>("");
  const [selected, setSelected] = useState<NotificationEvent | null>(null);

  const eventsQ = useNotificationEvents(tenantId, {
    status: tab as any,
    channel: channel || undefined,
  });
  const authQ = useAuthEmailLog(tenantId, { limit: 100 });

  const stats = useMemo(() => {
    const rows = eventsQ.data ?? [];
    const today = new Date().toISOString().slice(0, 10);
    return {
      queued: rows.filter((r) => r.status === "pending").length,
      sentToday: rows.filter((r) => r.status === "sent" && (r.sent_at ?? "").slice(0, 10) === today).length,
      failed: rows.filter((r) => r.status === "failed").length,
    };
  }, [eventsQ.data]);

  if (!canView) {
    return (
      <>
        <AppHeader title="Comms" />
        <div className="flex-1 p-6"><div className="sk-card p-6 text-sm text-muted-foreground">You don't have permission to view comms.</div></div>
      </>
    );
  }

  return (
    <>
      <AppHeader title="Comms" subtitle="Automated and manual customer messages." />
      <div className="flex-1 space-y-4 p-6">
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard label="Queued" value={stats.queued} tone="orange" />
          <StatCard label="Sent today" value={stats.sentToday} tone="green" />
          <StatCard label="Failed" value={stats.failed} tone="coral" />
        </div>

        <div className="sk-card overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 border-b border-border p-3">
            <div className="flex gap-1">
              {TABS.map((t) => {
                const Icon = t.icon;
                const active = tab === t.key;
                return (
                  <button key={t.key} onClick={() => setTab(t.key)}
                    className={"inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium " + (active ? "bg-sk-coral text-white" : "hover:bg-muted")}>
                    <Icon className="h-4 w-4" /> {t.label}
                  </button>
                );
              })}
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select value={channel} onChange={(e) => setChannel(e.target.value)}
                className="h-9 rounded-lg border border-border bg-white px-2 text-sm">
                <option value="">All channels</option>
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="sms">SMS</option>
              </select>
            </div>
          </div>

          {eventsQ.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
          {tab !== "auth" && !eventsQ.isLoading && !(eventsQ.data?.length) && (
            <div className="p-10 text-center text-sm text-muted-foreground">No messages match these filters.</div>
          )}
          {tab !== "auth" && !!eventsQ.data?.length && (
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">When</th>
                  <th className="px-4 py-2 text-left">Channel</th>
                  <th className="px-4 py-2 text-left">Event</th>
                  <th className="px-4 py-2 text-left">Recipient</th>
                  <th className="px-4 py-2 text-left">Subject</th>
                  <th className="px-4 py-2 text-left">Status</th>
                </tr>
              </thead>
              <tbody>
                {eventsQ.data.map((e) => {
                  const Icon = channelIcon(e.channel);
                  return (
                    <tr key={e.id} onClick={() => setSelected(e)}
                      className="cursor-pointer border-t border-border hover:bg-muted/40">
                      <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                        {format(new Date(e.created_at), "d MMM HH:mm")}
                      </td>
                      <td className="px-4 py-2"><Icon className="h-4 w-4 text-muted-foreground" /></td>
                      <td className="px-4 py-2">{e.event_type}</td>
                      <td className="px-4 py-2">{e.recipient_email ?? e.recipient_phone ?? e.customer?.email ?? "—"}</td>
                      <td className="px-4 py-2">{e.subject ?? "—"}</td>
                      <td className="px-4 py-2"><StatusChip status={e.status} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {tab === "auth" && (
            <>
              <div className="border-b border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
                Supabase auth emails (invites, password resets, magic links) sent via your tenant SMTP.
                These are separate from customer notifications above.
              </div>
              {authQ.isLoading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
              {!authQ.isLoading && !(authQ.data?.length) && (
                <div className="p-10 text-center text-sm text-muted-foreground">
                  No auth emails logged yet. If invites aren't appearing here, the Send Email Hook
                  in Supabase → Auth → Hooks is likely not enabled — see the note below.
                </div>
              )}
              {!!authQ.data?.length && (
                <table className="w-full text-sm">
                  <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-2 text-left">When</th>
                      <th className="px-4 py-2 text-left">Type</th>
                      <th className="px-4 py-2 text-left">Recipient</th>
                      <th className="px-4 py-2 text-left">Subject</th>
                      <th className="px-4 py-2 text-left">Status</th>
                      <th className="px-4 py-2 text-left">Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {authQ.data.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="whitespace-nowrap px-4 py-2 text-xs text-muted-foreground">
                          {format(new Date(r.created_at), "d MMM HH:mm")}
                        </td>
                        <td className="px-4 py-2 text-xs">{r.template_code ?? "—"}</td>
                        <td className="px-4 py-2">{r.to_email ?? "—"}</td>
                        <td className="px-4 py-2">{r.subject ?? "—"}</td>
                        <td className="px-4 py-2"><StatusChip status={r.status} /></td>
                        <td className="px-4 py-2 text-xs text-muted-foreground">{r.error_message ?? ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {selected && tenantId && (
        <CommsEventDrawer tenantId={tenantId} event={selected} onClose={() => setSelected(null)} />
      )}
    </>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: "orange" | "green" | "coral" }) {
  const toneClass = tone === "green" ? "text-sk-turquoise-dark bg-sk-turquoise-soft"
    : tone === "orange" ? "text-sk-orange bg-sk-orange-soft"
    : "text-sk-coral-dark bg-sk-coral-soft";
  return (
    <div className="sk-card p-4">
      <div className={"inline-flex items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium " + toneClass}>{label}</div>
      <div className="mt-2 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function StatusChip({ status }: { status: string | null }) {
  const map: Record<string, string> = {
    pending: "bg-sk-orange-soft text-sk-orange",
    sent: "bg-sk-turquoise-soft text-sk-turquoise-dark",
    failed: "bg-sk-coral-soft text-sk-coral-dark",
    skipped: "bg-muted text-muted-foreground",
  };
  const cls = map[status ?? ""] ?? "bg-muted text-muted-foreground";
  return <span className={"inline-flex rounded-full px-2 py-0.5 text-xs font-medium " + cls}>{status ?? "—"}</span>;
}

export { CommsInboxPage };