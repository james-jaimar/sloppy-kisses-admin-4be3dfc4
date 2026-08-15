import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { ModalShell } from "@/components/modals/ModalShell";
import { addExistingUserToTenant, inviteNewUser, useAssignableRoles } from "./queries";
import { makePassword } from "./EditUserDrawer";

interface Props {
  tenantId: string;
  onClose: () => void;
  onSaved: () => void;
}

type Mode = "manual" | "invite" | "link";

export default function InviteUserModal({ tenantId, onClose, onSaved }: Props) {
  const rolesQ = useAssignableRoles(tenantId);
  const [mode, setMode] = useState<Mode>("manual");
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState(makePassword());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    if (mode === "manual" && password.trim().length < 8) {
      toast({ title: "Password too short", description: "Use at least 8 characters.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const roleIds = Array.from(selected);
    const res =
      mode === "link"
        ? await addExistingUserToTenant({ tenantId, email, roleIds })
        : await inviteNewUser({
            tenantId,
            email,
            fullName,
            roleIds,
            password: mode === "manual" ? password.trim() : undefined,
          });
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Couldn't add user", description: (res as { ok: false; error: string }).error, variant: "destructive" });
      return;
    }
    toast({
      title: mode === "invite" ? "Invite sent" : "User added",
      description: mode === "manual" ? `Login: ${email.trim().toLowerCase()} · Password: ${password.trim()}` : undefined,
    });
    onSaved();
    onClose();
  }

  return (
    <ModalShell
      title="Add a user"
      subtitle="Create a login with a password, invite by email, or link an existing profile."
      onClose={onClose}
    >
      <form onSubmit={onSubmit} className="space-y-5 p-6">
        <div className="flex flex-wrap gap-2 rounded-lg bg-muted p-1 text-sm">
          <button
            type="button"
            onClick={() => setMode("manual")}
            className={`flex-1 rounded-md px-3 py-1.5 ${mode === "manual" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Create with password
          </button>
          <button
            type="button"
            onClick={() => setMode("invite")}
            className={`flex-1 rounded-md px-3 py-1.5 ${mode === "invite" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Invite by email
          </button>
          <button
            type="button"
            onClick={() => setMode("link")}
            className={`flex-1 rounded-md px-3 py-1.5 ${mode === "link" ? "bg-white shadow-sm font-medium" : "text-muted-foreground"}`}
          >
            Link existing profile
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Email</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-sk-coral"
              placeholder="name@sloppykisses.co.za"
            />
          </label>
          {mode !== "link" && (
            <label className="text-sm">
              <span className="mb-1 block font-medium">Full name</span>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-sk-coral"
                placeholder="Jane Smith"
              />
            </label>
          )}
        </div>

        {mode === "manual" && (
          <div className="rounded-lg border border-border p-4">
            <div className="text-sm font-medium">Password</div>
            <p className="mb-2 mt-1 text-xs text-muted-foreground">
              The account is created straight away and can sign in immediately — no email is sent. Dummy addresses are fine.
            </p>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="min-w-[200px] flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-sk-coral"
              />
              <button
                type="button"
                onClick={() => setPassword(makePassword())}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Generate
              </button>
            </div>
          </div>
        )}

        <div>
          <div className="mb-2 text-sm font-medium">Roles</div>
          {rolesQ.isLoading ? (
            <div className="text-sm text-muted-foreground">Loading roles…</div>
          ) : (
            <div className="grid gap-2 sm:grid-cols-2">
              {(rolesQ.data ?? []).map((r) => (
                <label
                  key={r.id}
                  className="flex items-start gap-2 rounded-lg border border-border p-3 text-sm hover:border-sk-coral"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={() => toggle(r.id)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0">
                    <div className="font-medium">{r.label}</div>
                    {r.description && (
                      <div className="text-xs text-muted-foreground">{r.description}</div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-medium text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : mode === "invite" ? "Send invite" : "Add user"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}