import { Link, useNavigate, useParams } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { StatusBadge } from "@/components/ui/status-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { usePet, useDeletePet } from "@/features/customers/queries";
import { AlertCircle, ArrowLeft, ExternalLink, Mail, Phone, Trash2, User } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { PetFormModal } from "./PetFormModal";
import { PetVaccinationsPanel } from "./PetVaccinationsPanel";
import { CollapsibleCard } from "@/components/ui/collapsible-card";
import { PinnedNotesBanner } from "@/features/customers/PinnedNotesBanner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { PetGroomingDefaultsPanel } from "@/features/grooming/instructions/PetGroomingDefaultsPanel";
import { SizeOverrideControl, SizeOverrideBadge } from "./SizeOverrideControl";

export default function PetDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { tenant } = useCurrentTenant();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const { data: pet, isLoading, isError, error, refetch } = usePet(id, tenant?.id);
  const [editing, setEditing] = useState(false);
  const del = useDeletePet(tenant?.id);

  const customer = (pet as any)?.customers ?? null;
  const active = pet?.status === "active";

  return (
    <>
      <AppHeader
        title="Pet profile"
        subtitle={pet?.pet_number ? `#${pet.pet_number}` : undefined}
        actions={
          pet && tenant && customer ? (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="h-10 rounded-xl border border-border bg-white px-4 text-sm font-semibold hover:bg-muted"
              >
                Edit pet
              </button>
              <button
                onClick={async () => {
                  if (!(await confirm({ title: `Delete pet ${pet.name}?`, description: "Enrolments, vaccinations and attendance for this pet will be removed. Blocked if linked to finalised invoices.", confirmLabel: "Delete", tone: "destructive" }))) return;
                  try {
                    await del.mutateAsync(pet.id);
                    toast.success("Pet deleted");
                    navigate(customer ? `/admin/customers/${customer.id}` : "/admin/pets");
                  } catch (err: any) {
                    toast.error(err?.message ?? "Failed to delete");
                  }
                }}
                disabled={del.isPending}
                className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border bg-white px-4 text-sm font-semibold text-sk-coral-dark hover:bg-sk-coral-soft disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" /> Delete
              </button>
            </div>
          ) : null
        }
      />
      <div className="flex-1 space-y-4 p-6">
        <div>
          <Link
            to="/admin/pets"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> All pets
          </Link>
        </div>

        {isLoading && (
          <div className="sk-card space-y-3 p-6">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
        )}

        {!isLoading && isError && (
          <div className="sk-card flex items-center gap-3 p-6 text-sm text-sk-coral-dark">
            <AlertCircle className="h-4 w-4" />
            Couldn't load pet. {(error as Error)?.message}
          </div>
        )}

        {!isLoading && !isError && !pet && (
          <div className="sk-card p-10 text-center text-sm text-muted-foreground">
            Pet not found in this tenant.
          </div>
        )}

        {pet && (
          <>
            <PinnedNotesBanner customerId={customer?.id} tenantId={tenant?.id} />
            <div className="sk-card p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div className="grid h-14 w-14 place-items-center rounded-2xl bg-sk-turquoise-soft text-sk-turquoise-dark text-lg font-semibold">
                    {pet.name?.[0]?.toUpperCase() ?? "?"}
                  </div>
                  <div>
                    <div className="text-xl font-semibold leading-tight">{pet.name}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {pet.pet_number ? `Pet #${pet.pet_number}` : "Pet"}
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <StatusBadge
                        status={active ? "confirmed" : "requested"}
                        label={active ? "Active" : pet.status ?? "—"}
                        tone={active ? "green" : "orange"}
                      />
                      <SizeOverrideBadge pet={pet as any} />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 grid gap-4 border-t border-border pt-4 md:grid-cols-3">
                <Info label="Species">{pet.species ?? "—"}</Info>
                <Info label="Breed">{pet.breed ?? "—"}</Info>
                <Info label="Sex">{pet.sex ?? "—"}</Info>
                <Info label="Size">{pet.size ?? "—"}</Info>
                <Info label="Sterilised">{pet.sterilised_status ?? "—"}</Info>
                <Info label="Microchip">{pet.microchip_number ?? "—"}</Info>
                <Info label="Colour">{pet.marks_colour ?? "—"}</Info>
                <Info label="Date of birth">{pet.date_of_birth ?? "—"}</Info>
              </div>

              {(pet.medical_notes || pet.behaviour_notes) && (
                <div className="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
                  {pet.medical_notes && (
                    <Info label="Medical notes">
                      <div className="whitespace-pre-wrap">{pet.medical_notes}</div>
                    </Info>
                  )}
                  {pet.behaviour_notes && (
                    <Info label="Behaviour notes">
                      <div className="whitespace-pre-wrap">{pet.behaviour_notes}</div>
                    </Info>
                  )}
                </div>
              )}
            </div>

            <div className="sk-card p-6">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-semibold">Owner</h3>
                {customer && (
                  <Link
                    to={`/admin/customers/${customer.id}`}
                    className="inline-flex items-center gap-1 text-xs font-medium text-sk-coral-dark hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Open customer
                  </Link>
                )}
              </div>
              {customer ? (
                <div className="grid gap-3 md:grid-cols-3">
                  <Info label="Customer">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {customer.full_name ??
                        [customer.first_name, customer.last_name].filter(Boolean).join(" ")}
                    </div>
                    {customer.customer_number && (
                      <div className="text-xs text-muted-foreground">
                        #{customer.customer_number}
                      </div>
                    )}
                  </Info>
                  <Info label="Email">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      {customer.email ?? "—"}
                    </div>
                  </Info>
                  <Info label="Mobile">
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      {customer.mobile ?? "—"}
                    </div>
                  </Info>
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No linked customer.</div>
              )}
            </div>

            {tenant && (
              <CollapsibleCard title="Vaccinations" subtitle="Dates, certificates and requirement status." storageKey={`admin-vax-${pet.id}`} defaultOpen>
                <PetVaccinationsPanel tenantId={tenant.id} petId={pet.id} species={pet.species as any} />
              </CollapsibleCard>
            )}
            {tenant && (
              <CollapsibleCard title="Grooming defaults" subtitle="Prefilled onto every grooming booking for this pet." storageKey={`admin-groom-${pet.id}`}>
                <div className="p-1">
                  <PetGroomingDefaultsPanel tenantId={tenant.id} petId={pet.id} />
                </div>
              </CollapsibleCard>
            )}
            {tenant && pet.species === "dog" && (
              <SizeOverrideControl pet={pet as any} />
            )}
          </>
        )}
      </div>

      {editing && pet && tenant && customer && (
        <PetFormModal
          tenantId={tenant.id}
          customerId={customer.id}
          pet={pet as any}
          onClose={() => setEditing(false)}
          onSaved={() => refetch()}
        />
      )}
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-sm">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}