import { useState } from "react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useCreateDaySwap, type DaycareEnrolment } from "./queries";

interface Props {
  tenantId: string;
  enrolment: DaycareEnrolment | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function DaySwapDialog({ tenantId, enrolment, open, onOpenChange }: Props) {
  const [originalDate, setOriginalDate] = useState("");
  const [newDate, setNewDate] = useState("");
  const [reason, setReason] = useState("");
  const create = useCreateDaySwap(tenantId);

  async function submit() {
    if (!enrolment || !originalDate || !newDate) {
      toast.error("Pick both dates");
      return;
    }
    try {
      await create.mutateAsync({
        daycare_enrolment_id: enrolment.id,
        pet_id: enrolment.pet_id,
        original_date: originalDate,
        new_date: newDate,
        reason: reason || null,
      });
      toast.success("Day swap saved");
      onOpenChange(false);
      setOriginalDate(""); setNewDate(""); setReason("");
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save swap");
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Swap a day{enrolment?.pet?.name ? ` - ${enrolment.pet.name}` : ""}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Original date (drop)</div>
            <input type="date" value={originalDate} onChange={(e) => setOriginalDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">New date (add)</div>
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
          <label className="block">
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Reason (optional)</div>
            <input type="text" value={reason} onChange={(e) => setReason(e.target.value)}
              className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm" />
          </label>
        </div>
        <DialogFooter>
          <button onClick={() => onOpenChange(false)} className="h-9 rounded-lg border border-border bg-white px-3 text-sm">Cancel</button>
          <button onClick={submit} disabled={create.isPending}
            className="h-9 rounded-lg bg-sk-coral px-3 text-sm font-semibold text-white disabled:opacity-50">
            Save swap
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}