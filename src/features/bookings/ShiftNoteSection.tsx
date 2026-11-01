import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Pin } from "lucide-react";
import { supabase } from "@/lib/supabase/client";

/** One-line staff note shown as a tag on diary cards. Never sent to customers. */
export function ShiftNoteSection({ tenantId, bookingId, value }: { tenantId: string; bookingId: string; value: string | null | undefined }) {
  const qc = useQueryClient();
  const [text, setText] = useState(value ?? "");
  const [saving, setSaving] = useState(false);
  useEffect(() => setText(value ?? ""), [value, bookingId]);
  const dirty = text.trim() !== (value ?? "").trim();

  async function save(next: string) {
    setSaving(true);
    const { error } = await supabase
      .from("bookings")
      .update({ shift_note: next.trim() || null } as any)
      .eq("id", bookingId)
      .eq("tenant_id", tenantId);
    setSaving(false);
    if (error) return toast.error(error.message);
    setText(next.trim());
    qc.invalidateQueries({ queryKey: ["bookings"] });
    qc.invalidateQueries({ queryKey: ["grooming_board"] });
    toast.success(next.trim() ? "Shift note saved" : "Shift note cleared");
  }

  return (
    <section>
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        <Pin className="h-3.5 w-3.5" /> Shift note
      </div>
      <div className="mt-1 flex gap-1.5">
        <input
          value={text}
          maxLength={80}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && dirty) void save(text); }}
          placeholder="e.g. Owner collecting 4pm · nervous of dryer"
          className="h-9 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
        />
        {dirty ? (
          <button disabled={saving} onClick={() => save(text)} className="h-9 rounded-lg bg-sk-coral px-3 text-xs font-semibold text-primary-foreground disabled:opacity-50">Save</button>
        ) : value ? (
          <button disabled={saving} onClick={() => save("")} className="h-9 rounded-lg border border-border px-3 text-xs font-medium hover:bg-muted">Clear</button>
        ) : null}
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">Staff only — shows on the diary card.</p>
    </section>
  );
}
