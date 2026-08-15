import { useState } from "react";
import { toast } from "@/hooks/use-toast";
import { ModalShell } from "@/components/modals/ModalShell";
import { manageUser, type TenantUserRow } from "./queries";
import { RefreshCw, Copy } from "lucide-react";

interface Props {
  tenantId: string;
  user: TenantUserRow;
  onClose: () => void;
  onSaved: () => void;
}

export function makePassword() {
  const words = ["Sunny", "Paws", "Kibble", "Fetch", "Collar", "Bark", "Whisk", "Snout"];
  const w = words[Math.floor(Math.random() * words.length)];
  const n = Math.floor(1000 + Math.random() * 9000);
  return `${w}${n}!`;
}

export default function EditUserDrawer({ tenantId, user, onClose, onSaved }: Props) {
  const [fullName, setFullName] = useState(user.profile.full_name ?? "");
  const [email, setEmail] = useState(user.profile.email ?? "");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await manageUser({
      tenantId,
      tenantUserId: user.id,
      fullName,
      email,
      password: password || undefined,
    });
    setSaving(false);
    if (!res.ok) {
      toast({ title: "Couldn't save user", description: (res as { ok: false; error: string }).error, variant: "destructive" });
      return;
    }
    toast({
      title: "User updated",
      description: password ? `New password: ${password}` : undefined,
    });
    onSaved();
    onClose();
  }

  return (
    <ModalShell title="Edit user" subtitle="Change their details or set a password directly." onClose={onClose}>
      <form onSubmit={onSubmit} className="space-y-5 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Full name</span>
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-sk-coral"
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium">Email / login</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-sk-coral"
            />
          </label>
        </div>

        <div className="rounded-lg border border-border p-4">
          <div className="text-sm font-medium">Set a password</div>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">
            Leave blank to keep their current password. Setting one here takes effect immediately — no email needed.
          </p>
          <div className="flex flex-wrap gap-2">
            <input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="New password (min 8 characters)"
              className="min-w-[200px] flex-1 rounded-lg border border-border bg-white px-3 py-2 text-sm outline-none focus:border-sk-coral"
            />
            <button
              type="button"
              onClick={() => setPassword(makePassword())}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Generate
            </button>
            {password && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard?.writeText(password);
                  toast({ title: "Password copied" });
                }}
                className="inline-flex items-center gap-1 rounded-lg border border-border px-3 py-2 text-xs font-medium hover:bg-muted"
              >
                <Copy className="h-3.5 w-3.5" /> Copy
              </button>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-sk-coral px-4 py-2 text-sm font-medium text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}