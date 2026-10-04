import { useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { KeyRound, Plus, Tablet, Tv } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCan } from "@/components/auth/Can";
import { useKioskStaff, useSaveKioskStaff, type KioskStaff } from "@/features/grooming/kiosk/kioskQueries";

const PERMISSION = "settings.grooming.manage";

export default function GroomingKioskStaffPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const canEdit = useCan(PERMISSION);
  const staffQ = useKioskStaff(tenantId);
  const save = useSaveKioskStaff(tenantId ?? "");
  const [editing, setEditing] = useState<Partial<KioskStaff> | null>(null);
  const [name, setName] = useState("");
  const [pin, setPin] = useState("");
  const [active, setActive] = useState(true);

  function openEdit(s: Partial<KioskStaff> | null) {
    setEditing(s);
    setName(s?.display_name ?? "");
    setActive(s?.active ?? true);
    setPin("");
  }

  async function submit() {
    if (!name.trim()) return toast.error("Enter a name");
    if (pin && !/^\d{4}$/.test(pin)) return toast.error("PIN must be 4 digits");
    if (!editing?.id && !pin) return toast.error("Set a 4-digit PIN");
    try {
      await save.mutateAsync({ id: editing?.id, display_name: name.trim(), active, pin: pin || undefined });
      toast.success("Saved");
      setEditing(null);
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't save");
    }
  }

  return (
    <>
      <AppHeader
        title="Parlour tablet & TV"
        subtitle="Groomers sign in on the parlour tablet with a 4-digit PIN to start and finish dogs."
        actions={canEdit ? (
          <button onClick={() => openEdit({})} className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground">
            <Plus className="h-4 w-4" /> Add groomer
          </button>
        ) : undefined}
      />
      <div className="flex-1 space-y-6 p-6">
        <div className="flex flex-wrap gap-3">
          <Link to="/kiosk/grooming" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
            <Tablet className="h-4 w-4" /> Open tablet screen
          </Link>
          <Link to="/kiosk/grooming/tv" className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium">
            <Tv className="h-4 w-4" /> Open TV screen
          </Link>
        </div>
        <p className="text-sm text-muted-foreground">
          Sign the tablet and TV in once with a staff login, then open these screens. Groomers don't need their own login — just their PIN.
        </p>

        {!canEdit && (
          <p className="rounded-lg border border-border bg-muted p-3 text-sm">Read-only. Ask an admin to add groomers or change PINs.</p>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-background">
          <table className="w-full text-sm">
            <thead className="bg-muted text-left">
              <tr><th className="px-4 py-2">Groomer</th><th className="px-4 py-2">PIN</th><th className="px-4 py-2">Status</th><th /></tr>
            </thead>
            <tbody>
              {(staffQ.data ?? []).map((s) => (
                <tr key={s.id} className="border-t border-border">
                  <td className="px-4 py-2 font-medium">{s.display_name}</td>
                  <td className="px-4 py-2">{s.has_pin ? "••••" : <span className="text-destructive">Not set</span>}</td>
                  <td className="px-4 py-2">{s.active ? "Active" : "Inactive"}</td>
                  <td className="px-4 py-2 text-right">
                    {canEdit && <button onClick={() => openEdit(s)} className="text-primary hover:underline">Edit</button>}
                  </td>
                </tr>
              ))}
              {staffQ.data?.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">No groomers yet. Add one to use the tablet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/50 p-4">
          <div className="w-full max-w-md space-y-4 rounded-2xl bg-background p-6">
            <h2 className="text-lg font-bold">{editing.id ? "Edit groomer" : "Add groomer"}</h2>
            <label className="block text-sm">
              <span className="mb-1 block font-medium">Name shown on tablet</span>
              <input value={name} onChange={(e) => setName(e.target.value)} className="h-10 w-full rounded-lg border border-border px-3" />
            </label>
            <label className="block text-sm">
              <span className="mb-1 flex items-center gap-1 font-medium"><KeyRound className="h-4 w-4" /> {editing.id ? "New PIN (leave blank to keep)" : "4-digit PIN"}</span>
              <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" type="password" className="h-10 w-full rounded-lg border border-border px-3 tracking-widest" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Active
            </label>
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="h-9 rounded-lg border border-border px-3 text-sm">Cancel</button>
              <button onClick={submit} disabled={save.isPending} className="h-9 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground disabled:opacity-50">
                {save.isPending ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
