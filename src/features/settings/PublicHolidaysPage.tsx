import { useState } from "react";
import { toast } from "sonner";
import { format } from "date-fns";
import { Plus, Trash2, CalendarOff } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AppHeader } from "@/components/layout/AppHeader";
import { ModalShell } from "@/components/modals/ModalShell";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCurrentTenant, useCurrentUser } from "@/lib/tenant/TenantContext";
import { supabase } from "@/lib/supabase/client";
import { usePublicHolidays, MOVEMENT_RULES_NOTE, type PublicHoliday } from "@/features/hotelForm/dayRules";

const PERMISSION = "settings.hotel.manage";
const input = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm";

const empty = {
  holiday_date: format(new Date(), "yyyy-MM-dd"),
  name: "",
  blocks_dropoff: true,
  blocks_collection: false,
};

export default function PublicHolidaysPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const { hasPermission } = useCurrentUser();
  const canManage = hasPermission(PERMISSION);
  const qc = useQueryClient();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<PublicHoliday | "new" | null>(null);

  const q = usePublicHolidays(tenantId);

  const save = useMutation({
    mutationFn: async ({ id, ...values }: any) => {
      if (id) {
        const { error } = await supabase.from("public_holidays" as any).update(values).eq("id", id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("public_holidays" as any)
          .insert({ ...values, tenant_id: tenantId } as any);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public_holidays"] });
      setEditing(null);
      toast.success("Saved");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not save"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("public_holidays" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["public_holidays"] });
      toast.success("Removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  const rows = q.data ?? [];
  const today = format(new Date(), "yyyy-MM-dd");

  return (
    <>
      <AppHeader
        title="Public holidays"
        subtitle="Days the gates stay shut for drop-offs and collections."
        actions={
          canManage ? (
            <button
              onClick={() => setEditing("new")}
              className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90"
            >
              <Plus className="h-4 w-4" /> Add holiday
            </button>
          ) : undefined
        }
      />
      <div className="flex-1 space-y-4 p-4 sm:p-6">
        <div className="rounded-xl border border-border bg-sk-surface-muted p-4 text-sm text-muted-foreground">
          {MOVEMENT_RULES_NOTE} 25 and 26 December and 1 January are always closed for both collections and
          drop-offs and cannot be booked, whether or not they are listed below.
        </div>

        <div className="sk-card overflow-hidden">
          {rows.length === 0 ? (
            <div className="p-6 text-sm text-muted-foreground">No holidays captured yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-left">Date</th>
                  <th className="px-4 py-2 text-left">Holiday</th>
                  <th className="px-4 py-2 text-left">Drop-offs</th>
                  <th className="px-4 py-2 text-left">Collections</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((h) => (
                  <tr key={h.id} className={`border-t border-border ${h.holiday_date < today ? "opacity-50" : ""}`}>
                    <td className="px-4 py-2 whitespace-nowrap tabular-nums">
                      {format(new Date(`${h.holiday_date}T00:00:00`), "dd MMM yyyy")}
                    </td>
                    <td className="px-4 py-2">{h.name}</td>
                    <td className="px-4 py-2">
                      {h.blocks_dropoff ? (
                        <span className="inline-flex items-center gap-1 text-sk-orange">
                          <CalendarOff className="h-3.5 w-3.5" /> Closed
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Open</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {h.blocks_collection ? (
                        <span className="inline-flex items-center gap-1 text-sk-orange">
                          <CalendarOff className="h-3.5 w-3.5" /> Closed
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Open</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {canManage && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditing(h)} className="text-xs font-semibold text-sk-coral-dark">
                            Edit
                          </button>
                          <button
                            onClick={async () => {
                              if (await confirm({ title: `Remove ${h.name}?` })) remove.mutate(h.id);
                            }}
                            className="text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {editing && (
        <HolidayModal
          value={editing === "new" ? { ...empty } : editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={(v) => save.mutate(v)}
        />
      )}
    </>
  );
}

function HolidayModal({
  value, saving, onClose, onSave,
}: {
  value: any;
  saving: boolean;
  onClose: () => void;
  onSave: (v: any) => void;
}) {
  const [form, setForm] = useState({ ...value });
  return (
    <ModalShell
      title={value.id ? "Edit holiday" : "Add holiday"}
      onClose={onClose}
      footer={
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm">Cancel</button>
          <button
            onClick={() => {
              if (!form.name.trim()) { toast.error("Give the holiday a name"); return; }
              onSave({
                id: form.id,
                holiday_date: form.holiday_date,
                name: form.name.trim(),
                blocks_dropoff: form.blocks_dropoff,
                blocks_collection: form.blocks_collection,
              });
            }}
            disabled={saving}
            className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral/90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 px-6 py-5">
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</div>
          <input type="date" value={form.holiday_date} onChange={(e) => setForm({ ...form, holiday_date: e.target.value })} className={input} />
        </label>
        <label className="block">
          <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Name</div>
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={input} placeholder="Heritage Day" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.blocks_dropoff} onChange={(e) => setForm({ ...form, blocks_dropoff: e.target.checked })} />
          Closed for drop-offs / check-in
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.blocks_collection} onChange={(e) => setForm({ ...form, blocks_collection: e.target.checked })} />
          Closed for collections / check-out
        </label>
      </div>
    </ModalShell>
  );
}
