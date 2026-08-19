import { format } from "date-fns";
import { Bell, StickyNote } from "lucide-react";
import { usePetDayNotes } from "./dayNotesQueries";

/** Read-only history of daycare day notes for one dog. */
export function PetDayNotesCard({ tenantId, petId }: { tenantId: string | null; petId: string }) {
  const { data, isLoading } = usePetDayNotes(tenantId, petId);
  const notes = data ?? [];
  if (!tenantId) return null;
  return (
    <div className="sk-card p-6">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
        <StickyNote className="h-4 w-4" /> Daycare day notes
      </h3>
      {isLoading && <div className="text-sm text-muted-foreground">Loading…</div>}
      {!isLoading && notes.length === 0 && (
        <div className="text-sm text-muted-foreground">No daycare notes yet.</div>
      )}
      <ul className="space-y-2">
        {notes.map((n) => (
          <li key={n.id} className="rounded-xl border border-border p-3">
            <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
              <span className="font-semibold text-foreground">
                {format(new Date(n.note_date), "dd MMM yyyy")}
              </span>
              <span>· {n.author?.full_name ?? n.author?.email ?? "Staff"}</span>
              {n.office_flag && (
                <span className="inline-flex items-center gap-1 text-sk-orange">
                  <Bell className="h-3 w-3" /> {n.handled_at ? "handled" : "for the office"}
                </span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{n.body}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
