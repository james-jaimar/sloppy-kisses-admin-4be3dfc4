import { useState } from "react";
import { toast } from "sonner";
import { Bell, Pin, StickyNote } from "lucide-react";
import { WorkSheet, BigButton } from "./WorkSheet";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { useCreateDayNote } from "@/features/daycare/dayNotesQueries";

/** Thumb-friendly note sheet for daycare staff. */
export function DayNoteSheet({
  tenantId,
  petId,
  petName,
  customerId,
  dateIso,
  onClose,
}: {
  tenantId: string;
  petId: string;
  petName: string;
  customerId?: string | null;
  dateIso: string;
  onClose: () => void;
}) {
  const { profile } = useCurrentUser();
  const create = useCreateDayNote(tenantId);
  const [body, setBody] = useState("");
  const [officeFlag, setOfficeFlag] = useState(false);
  const [lasting, setLasting] = useState(false);

  async function submit() {
    if (!body.trim()) {
      toast.error("Please write the note first");
      return;
    }
    try {
      await create.mutateAsync({
        petId,
        petName,
        customerId: customerId ?? null,
        dateIso,
        body,
        officeFlag,
        lasting,
        authorProfileId: profile?.id ?? null,
      });
      toast.success(officeFlag ? "Note saved — the office will see it" : "Note saved");
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Couldn't save the note");
    }
  }

  return (
    <WorkSheet
      title={`Note — ${petName}`}
      onClose={onClose}
      footer={
        <BigButton onClick={submit} disabled={create.isPending}>
          <StickyNote className="h-5 w-5" /> Save note
        </BigButton>
      }
    >
      <div className="space-y-4">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={5}
          autoFocus
          placeholder="e.g. Off her food today, went home in a red lead…"
          className="w-full rounded-2xl border border-border p-4 text-base outline-none focus:border-sk-coral"
        />

        <button
          type="button"
          onClick={() => setOfficeFlag((v) => !v)}
          className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left ${
            officeFlag ? "border-sk-orange bg-sk-orange-soft" : "border-border bg-white"
          }`}
        >
          <Bell className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span className="block text-base font-bold">The office needs to do something</span>
            <span className="block text-sm text-muted-foreground">
              Shows in the front desk worklist until someone ticks it off.
            </span>
          </span>
        </button>

        <button
          type="button"
          onClick={() => setLasting((v) => !v)}
          disabled={!customerId}
          className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left disabled:opacity-50 ${
            lasting ? "border-sk-coral bg-sk-coral-soft" : "border-border bg-white"
          }`}
        >
          <Pin className="mt-0.5 h-5 w-5 shrink-0" />
          <span>
            <span className="block text-base font-bold">This is true every day</span>
            <span className="block text-sm text-muted-foreground">
              Also pins it to the dog's owner record so it shows on every future day.
            </span>
          </span>
        </button>
      </div>
    </WorkSheet>
  );
}
