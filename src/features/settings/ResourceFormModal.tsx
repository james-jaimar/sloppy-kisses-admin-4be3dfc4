import { useState } from "react";
import { toast } from "sonner";
import { ModalShell } from "@/components/modals/ModalShell";
import {
  RESOURCE_TYPES,
  useCreateResource,
  useUpdateResource,
  type ResourceRow,
} from "./resourceQueries";
import type { ResourceType } from "@/features/bookings/queries";

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";

interface Props {
  tenantId: string;
  resource?: ResourceRow | null;
  onClose: () => void;
}

export function ResourceFormModal({ tenantId, resource, onClose }: Props) {
  const isEdit = Boolean(resource);
  const [name, setName] = useState(resource?.name ?? "");
  const [type, setType] = useState<ResourceType>(resource?.type ?? "inhouse_grooming");
  const [description, setDescription] = useState(resource?.description ?? "");
  const [capacity, setCapacity] = useState<string>(
    resource?.capacity != null ? String(resource.capacity) : "",
  );
  const [sortOrder, setSortOrder] = useState<string>(
    resource?.sort_order != null ? String(resource.sort_order) : "100",
  );
  const [active, setActive] = useState(resource?.active ?? true);

  const create = useCreateResource(tenantId);
  const update = useUpdateResource(tenantId);
  const saving = create.isPending || update.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return toast.error("Name is required");
    const patch = {
      name: trimmed,
      type,
      description: description.trim() || null,
      capacity: capacity.trim() ? Number(capacity) : null,
      sort_order: sortOrder.trim() ? Number(sortOrder) : 100,
      active,
    };
    try {
      if (isEdit && resource) {
        await update.mutateAsync({ id: resource.id, patch });
        toast.success("Resource updated");
      } else {
        await create.mutateAsync(patch);
        toast.success("Resource added");
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save resource");
    }
  }

  return (
    <ModalShell
      title={isEdit ? "Edit resource" : "New resource"}
      subtitle="Groomers, mobile vans, kennels, runs — anything a booking can be assigned to."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4 p-6">
        <div>
          <div className="mb-1 text-sm font-medium">Name</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} autoFocus />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Type</div>
          <select value={type} onChange={(e) => setType(e.target.value as ResourceType)} className={inputCls}>
            {RESOURCE_TYPES.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Description</div>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium">
              {type === "hotel_area" || type === "cattery_area" ? "Pens / spaces" : "Capacity"}
            </div>
            <input
              type="number"
              min={0}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder={type === "hotel_area" || type === "cattery_area" ? "e.g. 12 pens" : "e.g. 24 for daycare"}
              className={inputCls}
            />
            <div className="mt-1 text-[11px] text-muted-foreground">
              {type === "hotel_area" || type === "cattery_area"
                ? "How many pets can stay here at once. Used for occupancy and overbooking checks."
                : "Leave blank for no limit."}
            </div>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Sort order</div>
            <input
              type="number"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} className="h-4 w-4" />
          Active (available for new bookings)
        </label>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {saving ? "Saving…" : isEdit ? "Save changes" : "Add resource"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}