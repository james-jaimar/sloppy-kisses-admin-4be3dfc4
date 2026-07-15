import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { KeyRound, Mail, ShieldOff, ShieldCheck, Unlink, Loader2, UserPlus, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase/client";
import { useHasPermission } from "@/lib/permissions/permissions";
import type { CustomerRow } from "./queries";

type Props = { customer: CustomerRow };

type PortalStatus = "not_invited" | "invited" | "active" | "disabled";

function statusMeta(customer: CustomerRow, linkedEmail: string | null): { status: PortalStatus; label: string; tone: string } {
  if (!customer.linked_profile_id) return { status: "not_invited", label: "Not invited", tone: "bg-muted text-muted-foreground" };
  if (!customer.portal_access_enabled) return { status: "disabled", label: "Access disabled", tone: "bg-sk-coral-soft text-sk-coral-dark" };
  // Best-effort: if we can see a linked profile but customer.email doesn't match its email, still active
  if (linkedEmail) return { status: "active", label: "Portal active", tone: "bg-sk-green-soft text-sk-green" };
  return { status: "invited", label: "Invited (pending)", tone: "bg-sk-turquoise-soft text-sk-turquoise-dark" };
}

export default function PortalAccessPanel({ customer }: Props) {
  const canManage = useHasPermission("customers.portal.manage");
  const qc = useQueryClient();
  const [confirmDisable, setConfirmDisable] = useState(false);
  const [confirmUnlink, setConfirmUnlink] = useState(false);

  // Load linked profile email for display
  const profile = useQuery({
    queryKey: ["customer_portal_profile", customer.linked_profile_id],
    enabled: !!customer.linked_profile_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, email, full_name, created_at")
        .eq("id", customer.linked_profile_id as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const linkedEmail = (profile.data?.email ?? null) as string | null;
  const meta = statusMeta(customer, linkedEmail);

  const invite = useMutation({
    mutationFn: async (mode: "invite" | "resend") => {
      const { data, error } = await supabase.functions.invoke("customer-portal-invite", {
        body: { tenant_id: customer.tenant_id, customer_id: customer.id, mode },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error((data as any)?.error ?? "Invite failed");
      return data;
    },
    onSuccess: (data: any) => {
      if (data.email_sent) toast.success(data.resent ? "Invite resent" : "Invite sent");
      else toast.warning(`Account linked but email failed: ${data.email_error ?? "unknown error"}`);
      qc.invalidateQueries({ queryKey: ["customers", "detail"] });
      qc.invalidateQueries({ queryKey: ["customer_portal_profile"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Invite failed"),
  });

  const reset = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke("customer-portal-reset", {
        body: { tenant_id: customer.tenant_id, customer_id: customer.id },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error((data as any)?.error ?? "Reset failed");
      return data;
    },
    onSuccess: (data: any) => {
      if (data.email_sent) toast.success("Password reset email sent");
      else toast.error(`Reset email failed: ${data.email_error ?? "unknown"}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Reset failed"),
  });

  const toggleAccess = useMutation({
    mutationFn: async (enabled: boolean) => {
      const { error } = await supabase
        .from("customers")
        .update({ portal_access_enabled: enabled })
        .eq("id", customer.id);
      if (error) throw error;
    },
    onSuccess: (_d, enabled) => {
      toast.success(enabled ? "Portal access re-enabled" : "Portal access disabled");
      qc.invalidateQueries({ queryKey: ["customers", "detail"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      setConfirmDisable(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const unlink = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("customers")
        .update({ linked_profile_id: null, portal_access_enabled: false })
        .eq("id", customer.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Unlinked from auth user");
      qc.invalidateQueries({ queryKey: ["customers", "detail"] });
      qc.invalidateQueries({ queryKey: ["customer_portal_profile"] });
      setConfirmUnlink(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  if (!canManage) return null;

  const busy = invite.isPending || reset.isPending || toggleAccess.isPending || unlink.isPending;
  const hasEmail = !!customer.email?.trim();

  return (
    <div className="sk-card p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-sk-turquoise-soft text-sk-turquoise-dark">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <div className="text-sm font-semibold">Portal access</div>
            <div className="text-xs text-muted-foreground">
              {linkedEmail ? `Linked to ${linkedEmail}` : "No portal login yet"}
            </div>
          </div>
        </div>
        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${meta.tone}`}>{meta.label}</span>
      </div>

      {!hasEmail && (
        <div className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted p-3 text-xs text-muted-foreground">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5" />
          Add an email address to this customer before you can invite them to the portal.
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        {meta.status === "not_invited" && (
          <button
            onClick={() => invite.mutate("invite")}
            disabled={!hasEmail || busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            {invite.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" />}
            Invite to portal
          </button>
        )}

        {(meta.status === "invited" || meta.status === "active") && (
          <button
            onClick={() => invite.mutate("resend")}
            disabled={!hasEmail || busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <Mail className="h-3.5 w-3.5" /> Resend invite
          </button>
        )}

        {(meta.status === "active" || meta.status === "invited") && (
          <button
            onClick={() => reset.mutate()}
            disabled={!hasEmail || busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            {reset.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
            Send password reset
          </button>
        )}

        {meta.status === "active" && (
          <button
            onClick={() => setConfirmDisable(true)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted disabled:opacity-50"
          >
            <ShieldOff className="h-3.5 w-3.5" /> Disable access
          </button>
        )}

        {meta.status === "disabled" && (
          <button
            onClick={() => toggleAccess.mutate(true)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sk-green px-3 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            <ShieldCheck className="h-3.5 w-3.5" /> Re-enable access
          </button>
        )}

        {customer.linked_profile_id && (
          <button
            onClick={() => setConfirmUnlink(true)}
            disabled={busy}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            <Unlink className="h-3.5 w-3.5" /> Unlink auth user
          </button>
        )}
      </div>

      {confirmDisable && (
        <ConfirmDialog
          title="Disable portal access?"
          body="The customer's login will keep working but they'll see a 'no access' message. Bookings and invoices won't be visible in the portal until you re-enable it."
          confirmLabel="Disable access"
          onCancel={() => setConfirmDisable(false)}
          onConfirm={() => toggleAccess.mutate(false)}
          pending={toggleAccess.isPending}
        />
      )}
      {confirmUnlink && (
        <ConfirmDialog
          title="Unlink this customer from their auth user?"
          body="The customer record will no longer be tied to a portal login. The auth user itself is not deleted — you can invite the correct email afterwards."
          confirmLabel="Unlink"
          onCancel={() => setConfirmUnlink(false)}
          onConfirm={() => unlink.mutate()}
          pending={unlink.isPending}
        />
      )}
    </div>
  );
}

function ConfirmDialog({ title, body, confirmLabel, onCancel, onConfirm, pending }: {
  title: string; body: string; confirmLabel: string; onCancel: () => void; onConfirm: () => void; pending: boolean;
}) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onCancel}>
      <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-muted-foreground">{body}</p>
        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onCancel} className="h-9 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">Cancel</button>
          <button
            onClick={onConfirm}
            disabled={pending}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-50"
          >
            {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />} {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}