import { useEffect, useState } from "react";
import { Lock, LockOpen, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { useCommsSettings, useUpdateCommsSettings } from "./queries";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

const PERMISSION = "comms.sending.toggle";

/**
 * Master control for the global outbound-email lock.
 * While the lock is on, only addresses on the test allowlist can receive mail.
 */
export function SendLockCard() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canToggle = hasPermission(PERMISSION);

  const { data: settings, isLoading } = useCommsSettings(tenantId);
  const update = useUpdateCommsSettings(tenantId ?? "");

  const [allowlist, setAllowlist] = useState<string[]>([]);
  const [newEmail, setNewEmail] = useState("");
  const [confirmGoLive, setConfirmGoLive] = useState(false);

  useEffect(() => {
    setAllowlist(settings?.test_recipient_allowlist ?? []);
  }, [settings?.test_recipient_allowlist]);

  const enabled = settings?.sending_enabled === true;

  async function setEnabled(next: boolean) {
    try {
      await update.mutateAsync({ sending_enabled: next });
      toast.success(next ? "Live sending is ON — real customers will receive email" : "Outbound email locked");
    } catch (e: any) {
      toast.error(e?.message ?? "Could not change the send lock");
    }
  }

  async function saveAllowlist(next: string[]) {
    setAllowlist(next);
    try {
      await update.mutateAsync({ test_recipient_allowlist: next });
    } catch (e: any) {
      toast.error(e?.message ?? "Could not save the allowlist");
      setAllowlist(settings?.test_recipient_allowlist ?? []);
    }
  }

  function addEmail() {
    const v = newEmail.trim().toLowerCase();
    if (!v) return;
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { toast.error("That doesn't look like an email address"); return; }
    if (allowlist.includes(v)) { toast.error("Already on the list"); return; }
    setNewEmail("");
    void saveAllowlist([...allowlist, v]);
  }

  if (isLoading) return null;

  return (
    <div className={`rounded-xl border p-4 ${enabled ? "border-sk-orange bg-sk-orange-soft" : "border-sk-coral/40 bg-sk-coral-soft/50"}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${enabled ? "bg-sk-orange/20 text-sk-orange" : "bg-sk-coral/20 text-sk-coral"}`}>
            {enabled ? <LockOpen className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
          </div>
          <div>
            <div className="text-sm font-semibold">
              {enabled ? "Live sending is ON" : "Outbound email is LOCKED"}
            </div>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-muted-foreground">
              {enabled
                ? "Every email — invoices, reminders, notifications and auth mail — will be delivered to real customers."
                : "Nothing leaves the system except mail to the test addresses below. Blocked messages are still recorded in the email log so you can see exactly what would have gone out."}
            </p>
          </div>
        </div>
        {canToggle && (
          <button
            type="button"
            disabled={update.isPending}
            onClick={() => (enabled ? void setEnabled(false) : setConfirmGoLive(true))}
            className={`h-9 shrink-0 rounded-lg px-4 text-xs font-semibold text-white disabled:opacity-60 ${enabled ? "bg-sk-coral" : "bg-sk-teal"}`}
          >
            {enabled ? "Lock sending" : "Go live…"}
          </button>
        )}
      </div>

      <div className="mt-4 border-t border-border/60 pt-3">
        <div className="text-xs font-semibold">Test allowlist</div>
        <p className="mt-0.5 text-[11px] text-muted-foreground">
          These addresses always receive email, even while locked.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {allowlist.length === 0 && <span className="text-xs text-muted-foreground">No addresses — nothing can be sent at all.</span>}
          {allowlist.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 rounded-full border border-border bg-white px-2.5 py-1 text-xs">
              {a}
              {canToggle && (
                <button type="button" aria-label={`Remove ${a}`} onClick={() => void saveAllowlist(allowlist.filter((x) => x !== a))}>
                  <X className="h-3 w-3 text-muted-foreground hover:text-sk-coral" />
                </button>
              )}
            </span>
          ))}
        </div>
        {canToggle && (
          <div className="mt-3 flex gap-2">
            <input
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
              placeholder="add@test-address.com"
              className="h-9 w-full max-w-xs rounded-lg border border-border bg-white px-3 text-sm"
            />
            <button type="button" onClick={addEmail} className="inline-flex h-9 items-center gap-1 rounded-lg border border-border bg-white px-3 text-xs font-medium">
              <Plus className="h-3.5 w-3.5" /> Add
            </button>
          </div>
        )}
        {!canToggle && (
          <p className="mt-2 text-[11px] text-muted-foreground">You need the "Toggle outbound sending" permission to change this.</p>
        )}
      </div>

      <ConfirmDialog
        open={confirmGoLive}
        onOpenChange={setConfirmGoLive}
        title="Turn on live email sending?"
        description="Real customers will start receiving invoices, reminders and notifications immediately. Make sure any test data has been cleaned up first."
        confirmLabel="Yes, go live"
        destructive
        onConfirm={() => { setConfirmGoLive(false); void setEnabled(true); }}
      />
    </div>
  );
}