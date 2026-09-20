import { useState } from "react";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, UserCheck, Mail, Phone } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useCustomerContactVisibility } from "@/lib/privacy/useCustomerContactVisibility";
import {
  useCustomerContacts,
  useSaveCustomerContact,
  useDeleteCustomerContact,
  useSwapAccountHolder,
  type CustomerContact,
  type CustomerContactInput,
} from "./contactQueries";

const RELATIONSHIPS = ["Partner", "Spouse", "Family", "Housekeeper", "Other"];

const inputCls =
  "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";

export function ContactsPanel({
  tenantId,
  customerId,
  accountHolderName,
}: {
  tenantId: string;
  customerId: string;
  accountHolderName: string;
}) {
  const confirm = useConfirm();
  const { canSeeCustomerPhone } = useCustomerContactVisibility();
  const { data: contacts, isLoading } = useCustomerContacts(customerId);
  const save = useSaveCustomerContact(tenantId, customerId);
  const del = useDeleteCustomerContact(customerId);
  const swap = useSwapAccountHolder(customerId, tenantId);

  const [editing, setEditing] = useState<CustomerContact | "new" | null>(null);

  return (
    <div className="sk-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold">Contacts</h3>
          <p className="text-xs text-muted-foreground">
            {accountHolderName} is the account holder — invoices and the portal login belong to them.
          </p>
        </div>
        <button
          onClick={() => setEditing("new")}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium hover:bg-muted"
        >
          <Plus className="h-3.5 w-3.5" /> Add contact
        </button>
      </div>

      {isLoading && <div className="text-xs text-muted-foreground">Loading contacts…</div>}

      {!isLoading && (contacts?.length ?? 0) === 0 && (
        <div className="rounded-xl border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No second contact yet. Add a partner or family member so they get copies of confirmations,
          reminders and invoices.
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {contacts?.map((c) => (
          <div key={c.id} className="rounded-xl border border-border bg-white p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{c.full_name}</div>
                {c.relationship && (
                  <div className="text-xs text-muted-foreground">{c.relationship}</div>
                )}
              </div>
              <div className="flex gap-1">
                <button
                  onClick={() => setEditing(c)}
                  className="rounded-lg border border-border p-1.5 hover:bg-muted"
                  aria-label="Edit contact"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={async () => {
                    if (
                      !(await confirm({
                        title: `Remove ${c.full_name}?`,
                        description: "They will stop receiving copies of emails for this customer.",
                        confirmLabel: "Remove",
                        tone: "destructive",
                      }))
                    )
                      return;
                    try {
                      await del.mutateAsync(c.id);
                      toast.success("Contact removed");
                    } catch (e: any) {
                      toast.error(e?.message ?? "Failed to remove");
                    }
                  }}
                  className="rounded-lg border border-border p-1.5 text-sk-coral-dark hover:bg-sk-coral-soft"
                  aria-label="Remove contact"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="mt-2 space-y-1 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <Mail className="h-3.5 w-3.5" /> {c.email || "—"}
              </div>
              <div className="flex items-center gap-1.5">
                <Phone className="h-3.5 w-3.5" />{" "}
                {canSeeCustomerPhone ? c.mobile || "—" : "Number hidden"}
              </div>
            </div>
            <div className="mt-2 flex items-center justify-between gap-2">
              <span
                className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ${
                  c.receives_emails
                    ? "bg-sk-green-soft text-sk-green"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {c.receives_emails ? "Gets copies of emails" : "No emails"}
              </span>
              <button
                disabled={swap.isPending}
                onClick={async () => {
                  if (
                    !(await confirm({
                      title: `Make ${c.full_name} the account holder?`,
                      description:
                        "Their name, email and mobile move onto the account — invoices and the portal login follow. The current account holder becomes the second contact.",
                      confirmLabel: "Make account holder",
                    }))
                  )
                    return;
                  try {
                    await swap.mutateAsync(c.id);
                    toast.success("Account holder updated");
                  } catch (e: any) {
                    toast.error(e?.message ?? "Failed to switch");
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-[11px] font-medium hover:bg-muted disabled:opacity-50"
              >
                <UserCheck className="h-3.5 w-3.5" /> Make account holder
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <ContactModal
          contact={editing === "new" ? null : editing}
          saving={save.isPending}
          onClose={() => setEditing(null)}
          onSave={async (input) => {
            try {
              await save.mutateAsync({
                id: editing === "new" ? undefined : editing.id,
                input,
              });
              toast.success("Contact saved");
              setEditing(null);
            } catch (e: any) {
              toast.error(e?.message ?? "Failed to save");
            }
          }}
        />
      )}
    </div>
  );
}

function ContactModal({
  contact,
  saving,
  onClose,
  onSave,
}: {
  contact: CustomerContact | null;
  saving: boolean;
  onClose: () => void;
  onSave: (input: CustomerContactInput) => void;
}) {
  const [fullName, setFullName] = useState(contact?.full_name ?? "");
  const [relationship, setRelationship] = useState(contact?.relationship ?? "Partner");
  const [mobile, setMobile] = useState(contact?.mobile ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [receives, setReceives] = useState(contact?.receives_emails ?? true);

  return (
    <ModalShell title={contact ? "Edit contact" : "Add contact"} onClose={onClose}>
      <div className="space-y-4 p-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Full name</label>
          <input className={inputCls} value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Relationship</label>
            <select
              className={inputCls}
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
            >
              {RELATIONSHIPS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-muted-foreground">Mobile</label>
            <input className={inputCls} value={mobile} onChange={(e) => setMobile(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
          <input className={inputCls} value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={receives}
            onChange={(e) => setReceives(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          Send them copies of confirmations, reminders and invoices
        </label>
      </div>
      <div className="flex justify-end gap-2 border-t border-border p-4">
        <button onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
          Cancel
        </button>
        <button
          disabled={saving || !fullName.trim()}
          onClick={() =>
            onSave({
              full_name: fullName.trim(),
              relationship: relationship || null,
              mobile: mobile.trim() || null,
              email: email.trim() || null,
              receives_emails: receives,
            })
          }
          className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
        >
          Save contact
        </button>
      </div>
    </ModalShell>
  );
}
