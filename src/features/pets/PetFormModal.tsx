import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCreatePet, useUpdatePet, type PetRow } from "@/features/customers/queries";
import { BreedPicker } from "./BreedPicker";

type Species = "dog" | "cat" | "other";
type Sex = "male" | "female" | "unknown";
type Size = "xsmall" | "small" | "medium" | "large" | "xlarge" | "xxlarge";
type Sterilised = "yes" | "no" | "unknown" | "not_applicable";
type Status = "active" | "inactive" | "archived";

interface Props {
  tenantId: string;
  customerId: string;
  pet?: PetRow | null; // present = edit
  onClose: () => void;
  onSaved?: () => void;
}

interface FormState {
  name: string;
  species: Species;
  breed: string;
  sex: Sex;
  size: Size | "";
  date_of_birth: string;
  marks_colour: string;
  microchip_number: string;
  sterilised_status: Sterilised;
  status: Status;
  medical_notes: string;
  behaviour_notes: string;
}

function fromPet(p?: PetRow | null): FormState {
  return {
    name: p?.name ?? "",
    species: (p?.species as Species) ?? "dog",
    breed: p?.breed ?? "",
    sex: (p?.sex as Sex) ?? "unknown",
    size: (p?.size as Size) ?? "",
    date_of_birth: p?.date_of_birth ?? "",
    marks_colour: p?.marks_colour ?? "",
    microchip_number: p?.microchip_number ?? "",
    sterilised_status: (p?.sterilised_status as Sterilised) ?? "unknown",
    status: (p?.status as Status) ?? "active",
    medical_notes: p?.medical_notes ?? "",
    behaviour_notes: p?.behaviour_notes ?? "",
  };
}

export function PetFormModal({ tenantId, customerId, pet, onClose, onSaved }: Props) {
  const isEdit = Boolean(pet);
  const [form, setForm] = useState<FormState>(() => fromPet(pet));
  const create = useCreatePet(tenantId);
  const update = useUpdatePet(tenantId);
  const busy = create.isPending || update.isPending;

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Pet name is required");
      return;
    }
    if (form.species === "dog") {
      if (!form.breed.trim()) { toast.error("Breed is required for dogs"); return; }
      if (!form.size) { toast.error("Size is required for dogs"); return; }
    }
    const payload: any = {
      name: form.name.trim(),
      species: form.species,
      breed: form.breed.trim() || null,
      sex: form.sex,
      size: form.size || null,
      date_of_birth: form.date_of_birth || null,
      marks_colour: form.marks_colour.trim() || null,
      microchip_number: form.microchip_number.trim() || null,
      microchipped: Boolean(form.microchip_number.trim()),
      sterilised_status: form.sterilised_status,
      status: form.status,
      medical_notes: form.medical_notes.trim() || null,
      behaviour_notes: form.behaviour_notes.trim() || null,
    };

    try {
      if (isEdit && pet) {
        await update.mutateAsync({ id: pet.id, patch: payload });
        toast.success("Pet updated");
      } else {
        const created = await create.mutateAsync({ ...payload, customer_id: customerId });
        toast.success(`Pet ${created.pet_number} added`);
      }
      onSaved?.();
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save pet");
    }
  }

  return (
    <ModalShell
      title={isEdit ? "Edit pet" : "Add pet"}
      subtitle={
        isEdit
          ? pet?.pet_number
            ? `Pet #${pet.pet_number}`
            : undefined
          : "A new pet number will be assigned automatically."
      }
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-5 p-6">
        {isEdit && pet?.pet_number && (
          <Field label="Pet number">
            <input
              value={pet.pet_number}
              readOnly
              disabled
              className="h-10 w-full cursor-not-allowed rounded-lg border border-border bg-muted px-3 text-sm text-muted-foreground"
            />
          </Field>
        )}
        <Field label="Name">
          <TextInput value={form.name} onChange={(v) => set("name", v)} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Species">
            <Select
              value={form.species}
              onChange={(v) => set("species", v as Species)}
              options={[
                ["dog", "Dog"],
                ["cat", "Cat"],
                ["other", "Other"],
              ]}
            />
          </Field>
          <Field label="Breed">
            {form.species === "dog" ? (
              <BreedPicker
                value={form.breed}
                onChange={(breed, size) =>
                  setForm((f) => ({ ...f, breed, ...(size ? { size } : {}) }))
                }
              />
            ) : (
              <TextInput value={form.breed} onChange={(v) => set("breed", v)} />
            )}
          </Field>
          <Field label="Sex">
            <Select
              value={form.sex}
              onChange={(v) => set("sex", v as Sex)}
              options={[
                ["male", "Male"],
                ["female", "Female"],
                ["unknown", "Unknown"],
              ]}
            />
          </Field>
          <Field label="Size">
            <Select
              value={form.size}
              onChange={(v) => set("size", v as Size)}
              options={[
                ["", "—"],
                ["xsmall", "X-Small"],
                ["small", "Small"],
                ["medium", "Medium"],
                ["large", "Large"],
                ["xlarge", "X-Large"],
                ["xxlarge", "XX-Large"],
              ]}
            />
          </Field>
          <Field label="Date of birth">
            <TextInput
              type="date"
              value={form.date_of_birth}
              onChange={(v) => set("date_of_birth", v)}
            />
          </Field>
          <Field label="Colour / markings">
            <TextInput value={form.marks_colour} onChange={(v) => set("marks_colour", v)} />
          </Field>
          <Field label="Microchip number">
            <TextInput value={form.microchip_number} onChange={(v) => set("microchip_number", v)} />
          </Field>
          <Field label="Sterilised">
            <Select
              value={form.sterilised_status}
              onChange={(v) => set("sterilised_status", v as Sterilised)}
              options={[
                ["yes", "Yes"],
                ["no", "No"],
                ["unknown", "Unknown"],
                ["not_applicable", "N/A"],
              ]}
            />
          </Field>
          <Field label="Status">
            <Select
              value={form.status}
              onChange={(v) => set("status", v as Status)}
              options={[
                ["active", "Active"],
                ["inactive", "Inactive"],
                ["archived", "Archived"],
              ]}
            />
          </Field>
        </div>
        <Field label="Medical notes">
          <TextArea value={form.medical_notes} onChange={(v) => set("medical_notes", v)} />
        </Field>
        <Field label="Behaviour notes">
          <TextArea value={form.behaviour_notes} onChange={(v) => set("behaviour_notes", v)} />
        </Field>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEdit ? "Save changes" : "Add pet"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 font-medium">{label}</div>
      {children}
    </label>
  );
}

function TextInput({
  value,
  onChange,
  type = "text",
}: {
  value: string;
  onChange: (v: string) => void;
  type?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
    />
  );
}

function TextArea({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={3}
      className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
    />
  );
}

function Select({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
    >
      {options.map(([v, label]) => (
        <option key={v} value={v}>
          {label}
        </option>
      ))}
    </select>
  );
}