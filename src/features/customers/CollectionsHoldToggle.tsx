import { useState } from "react";
import { toast } from "sonner";
import { PauseCircle, PlayCircle } from "lucide-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";

/**
 * Puts a customer on collections hold: overdue interest and payment reminders skip them.
 * Used when an account is in dispute or on an agreed payment arrangement.
 */
export function CollectionsHoldToggle({
  customerId,
  onHold,
  note,
}: {
  customerId: string;
  onHold: boolean;
  note?: string | null;
}) {
  const qc = useQueryClient();
  const [reason, setReason] = useState(note ?? "");
  const [open, setOpen] = useState(false);

  const m = useMutation({
    mutationFn: async (hold: boolean) => {
      const { error } = await supabase
        .from("customers")
        .update({
          collections_hold: hold,
          collections_hold_note: hold ? reason.trim() || null : null,
        } as any)
        .eq("id", customerId);
      if (error) throw error;
      return hold;
    },
    onSuccess: (hold) => {
      qc.invalidateQueries({ queryKey: ["customer"] });
      qc.invalidateQueries({ queryKey: ["customers"] });
      setOpen(false);
      toast.success(hold ? "Collections on hold" : "Collections resumed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not update"),
  });

  if (onHold) {
    return (
      <div className="rounded-lg border border-sk-orange bg-sk-orange-soft px-3 py-2 text-xs text-sk-orange">
        <div className="flex flex-wrap items-center gap-2">
          <PauseCircle className="h-4 w-4" />
          <span className="font-semibold">Collections on hold</span>
          {note && <span className="opacity-80">— {note}</span>}
          <button
            onClick={() => m.mutate(false)}
            disabled={m.isPending}
            className="ml-auto inline-flex items-center gap-1 rounded-md border border-sk-orange px-2 py-1 font-medium hover:bg-white/40"
          >
            <PlayCircle className="h-3.5 w-3.5" /> Resume
          </button>
        </div>
      </div>
    );
  }

  return open ? (
    <div className="rounded-lg border border-border bg-white p-3 text-xs">
      <label className="text-[11px] font-medium text-muted-foreground">Why is collection on hold?</label>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="e.g. payment arrangement agreed"
        className="mt-1 h-9 w-full rounded-lg border border-border px-3 text-sm"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button onClick={() => setOpen(false)} className="rounded-md border border-border px-2 py-1 font-medium hover:bg-muted">
          Cancel
        </button>
        <button
          onClick={() => m.mutate(true)}
          disabled={m.isPending}
          className="rounded-md bg-sk-coral px-2 py-1 font-semibold text-white hover:opacity-90 disabled:opacity-60"
        >
          Put on hold
        </button>
      </div>
    </div>
  ) : (
    <button
      onClick={() => setOpen(true)}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted"
    >
      <PauseCircle className="h-3.5 w-3.5" /> Hold collections
    </button>
  );
}
