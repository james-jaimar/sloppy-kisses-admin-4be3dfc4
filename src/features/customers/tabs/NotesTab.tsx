import { useState } from "react";
import { AlertTriangle, Loader2, Pencil, Pin, PinOff, Plus, Trash2, X, Check } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import {
  useCustomerNotes,
  useCreateCustomerNote,
  useUpdateCustomerNote,
  useDeleteCustomerNote,
  type CustomerNote,
} from "../notesQueries";
import { useConfirm } from "@/components/ui/confirm-dialog";

export function NotesTab({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  const { data, isLoading, isError, error } = useCustomerNotes(customerId, tenantId);
  const create = useCreateCustomerNote(tenantId, customerId);
  const [body, setBody] = useState("");
  const [pinned, setPinned] = useState(false);
  const [alertFlag, setAlertFlag] = useState(false);

  const submit = async () => {
    if (!body.trim()) return;
    try {
      await create.mutateAsync({ body, pinned, alert: alertFlag });
      setBody("");
      setPinned(false);
      setAlertFlag(false);
      toast.success("Note added");
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-border bg-white p-3">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Add a note for the team — e.g. 'Always pays late', 'Bring extra towels'…"
          rows={3}
          className="w-full resize-none rounded-lg border border-border bg-transparent px-3 py-2 text-sm outline-none focus:border-sk-coral"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3 text-xs">
            <label className="inline-flex items-center gap-1.5">
              <input type="checkbox" checked={pinned} onChange={(e) => setPinned(e.target.checked)} />
              <Pin className="h-3.5 w-3.5" /> Pin
            </label>
            <label className="inline-flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={alertFlag}
                onChange={(e) => {
                  setAlertFlag(e.target.checked);
                  if (e.target.checked) setPinned(true);
                }}
              />
              <AlertTriangle className="h-3.5 w-3.5" /> Alert (urgent — red banner)
            </label>
          </div>
          <button
            onClick={submit}
            disabled={!body.trim() || create.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg bg-sk-coral px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" /> Add note
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading notes…
        </div>
      )}
      {isError && <div className="text-sm text-sk-coral-dark">{(error as Error)?.message}</div>}
      {!isLoading && !data?.length && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No notes yet.
        </div>
      )}
      <ul className="flex flex-col gap-2">
        {(data ?? []).map((n) => (
          <NoteRow key={n.id} note={n} tenantId={tenantId} customerId={customerId} />
        ))}
      </ul>
    </div>
  );
}

function NoteRow({
  note,
  tenantId,
  customerId,
}: {
  note: CustomerNote;
  tenantId: string;
  customerId: string;
}) {
  const upd = useUpdateCustomerNote(tenantId, customerId);
  const del = useDeleteCustomerNote(tenantId, customerId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note.body);

  const bg = note.alert
    ? "border-sk-coral/40 bg-sk-coral/5"
    : note.pinned
      ? "border-amber-400/50 bg-amber-50/50"
      : "border-border bg-white";

  return (
    <li className={`rounded-xl border ${bg} p-3`}>
      <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          {note.pinned && <Pin className="h-3 w-3" />}
          {note.alert && <AlertTriangle className="h-3 w-3 text-sk-coral-dark" />}
          <span>{note.author?.full_name ?? note.author?.email ?? "Staff"}</span>
          <span>·</span>
          <span>{format(new Date(note.created_at), "dd MMM yyyy HH:mm")}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            title={note.pinned ? "Unpin" : "Pin"}
            onClick={() => upd.mutate({ id: note.id, pinned: !note.pinned })}
            className="rounded p-1 hover:bg-muted"
          >
            {note.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
          </button>
          <button
            title={note.alert ? "Clear alert" : "Mark alert"}
            onClick={() =>
              upd.mutate({ id: note.id, alert: !note.alert, pinned: !note.alert ? true : note.pinned })
            }
            className={`rounded p-1 hover:bg-muted ${note.alert ? "text-sk-coral-dark" : ""}`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
          </button>
          <button
            title="Edit"
            onClick={() => {
              setDraft(note.body);
              setEditing((v) => !v);
            }}
            className="rounded p-1 hover:bg-muted"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
          <button
            title="Delete"
            onClick={async () => {
              if (await confirmDialog({ title: "Delete this note?", confirmLabel: "Delete", tone: "destructive" })) del.mutate(note.id);
            }}
            className="rounded p-1 text-sk-coral-dark hover:bg-muted"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      {editing ? (
        <div>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            className="w-full resize-none rounded-lg border border-border bg-white px-2 py-1.5 text-sm outline-none focus:border-sk-coral"
          />
          <div className="mt-1 flex justify-end gap-1">
            <button
              onClick={() => setEditing(false)}
              className="inline-flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-muted"
            >
              <X className="h-3 w-3" /> Cancel
            </button>
            <button
              onClick={async () => {
                if (!draft.trim()) return;
                await upd.mutateAsync({ id: note.id, body: draft });
                setEditing(false);
              }}
              className="inline-flex items-center gap-1 rounded bg-sk-coral px-2 py-1 text-xs font-medium text-white"
            >
              <Check className="h-3 w-3" /> Save
            </button>
          </div>
        </div>
      ) : (
        <div className="whitespace-pre-wrap text-sm text-foreground">{note.body}</div>
      )}
    </li>
  );
}