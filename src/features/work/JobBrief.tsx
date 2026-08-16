import { AlertTriangle, MapPin, Navigation, Scissors, ShieldAlert, Sparkles } from "lucide-react";
import { addressLines } from "@/lib/address/format";
import { PET_SIZE_LABEL, type PetSize } from "@/features/pets/sizeUtils";
import { useBookingVaccinationGate, isVaxOutstanding, VAX_STATUS_LABEL } from "@/features/pets/vaccinationGate";
import { usePetHealthGate, holdReasonLabel } from "@/features/pets/healthQueries";
import { useBookingInstructions, usePetGroomingDefaults, useInstructionCatalog } from "@/features/grooming/instructions/queries";
import type { Selections } from "@/features/grooming/instructions/queries";
import type { WorkJobAddon, WorkJobAddress, WorkJobGroomingDetails, WorkJobPet } from "./queries";

function Card({
  tone = "plain",
  title,
  icon: Icon,
  children,
}: {
  tone?: "plain" | "warn" | "danger";
  title: string;
  icon: any;
  children: React.ReactNode;
}) {
  const toneCls =
    tone === "danger"
      ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
      : tone === "warn"
        ? "border-sk-orange bg-sk-orange-soft text-sk-orange"
        : "border-border bg-white";
  return (
    <section className={`rounded-2xl border p-4 ${toneCls}`}>
      <h2 className="mb-3 flex items-center gap-2 text-base font-bold">
        <Icon className="h-5 w-5 shrink-0" /> {title}
      </h2>
      {children}
    </section>
  );
}

/** Vaccination gate + health holds + behaviour flags for this booking. */
export function JobAlerts({ bookingId, pets, onDate }: { bookingId: string; pets: WorkJobPet[]; onDate?: string }) {
  const vaxQ = useBookingVaccinationGate(bookingId);
  const healthQ = usePetHealthGate(pets[0]?.id ?? null, onDate);

  const vaxRows = (vaxQ.data ?? []).filter((r) => isVaxOutstanding(r.status));
  const holds = (healthQ.data?.holds ?? []).map(
    (h: any) => `Not fit to attend — ${holdReasonLabel(h.reason)}${h.notes ? ` (${h.notes})` : ""}`,
  );
  const treatments = (healthQ.data?.treatments ?? [])
    .filter((t: any) => t.status !== "ok" && t.gate_mode !== "off")
    .map((t: any) =>
      t.status === "missing"
        ? `${t.label}: no treatment on record`
        : t.status === "overdue"
          ? `${t.label}: overdue since ${t.next_due_date ?? "—"}`
          : `${t.label}: due ${t.next_due_date ?? "—"}`,
    );

  const behaviour: string[] = [];
  for (const p of pets) {
    const flags = [
      p.behaviour_aggressive_history ? "history of aggression" : "",
      p.behaviour_nervous ? "nervous" : "",
      p.behaviour_barker ? "barker" : "",
      p.behaviour_jumps ? "jumps" : "",
    ].filter(Boolean);
    if (flags.length) behaviour.push(`${p.name ?? "Pet"}: ${flags.join(", ")}`);
    if (p.behaviour_notes?.trim()) behaviour.push(`${p.name ?? "Pet"}: ${p.behaviour_notes.trim()}`);
  }
  const medical = pets
    .filter((p) => p.medical_notes?.trim())
    .map((p) => `${p.name ?? "Pet"}: ${p.medical_notes?.trim() ?? ""}`);

  if (vaxQ.isError || healthQ.isError) {
    return (
      <Card tone="warn" title="Safety checks unavailable" icon={ShieldAlert}>
        <p className="text-sm font-semibold">Vaccination or health warnings could not be loaded. Check with the office before starting.</p>
      </Card>
    );
  }

  const nothing =
    vaxRows.length === 0 && holds.length === 0 && treatments.length === 0 && behaviour.length === 0 && medical.length === 0;
  if (nothing) return null;

  return (
    <Card tone="warn" title="Before you start" icon={ShieldAlert}>
      <ul className="space-y-1.5 text-sm font-medium">
        {vaxRows.map((r) => (
          <li key={`${r.pet_id}-${r.vaccine_type}`}>
            {r.pet_name} — {r.label}: {VAX_STATUS_LABEL[r.status] ?? r.status}
            {r.expiry_date ? ` (${r.expiry_date})` : ""}
          </li>
        ))}
        {[...holds, ...treatments, ...medical, ...behaviour].map((t) => (
          <li key={t}>{t}</li>
        ))}
      </ul>
    </Card>
  );
}

/** Where to drive to, for mobile jobs. */
export function JobAddress({
  address,
  fallbackText,
}: {
  address: WorkJobAddress | null;
  fallbackText: string | null;
}) {
  const lines = address ? addressLines(address) : null;
  const street = lines?.street || fallbackText || "";
  if (!street && !lines?.unit) {
    return (
      <Card tone="warn" title="Where" icon={MapPin}>
        <p className="text-sm font-semibold">No service address was captured for this mobile appointment. Call the office before setting off.</p>
      </Card>
    );
  }
  const query = encodeURIComponent([lines?.unit, street].filter(Boolean).join(", "));
  return (
    <Card title="Where" icon={MapPin}>
      <div className="space-y-1 text-sm">
        {lines?.unit && <div className="font-semibold">{lines.unit}</div>}
        <div>{street || "—"}</div>
        {lines?.access && <div className="text-muted-foreground">{lines.access}</div>}
      </div>
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${query}`}
        target="_blank"
        rel="noreferrer"
        className="mt-3 inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl bg-sk-turquoise px-4 text-base font-bold text-white"
      >
        <Navigation className="h-5 w-5" /> Open in Maps
      </a>
    </Card>
  );
}

function selectionLines(
  selections: Selections | null | undefined,
  catalog: ReturnType<typeof useInstructionCatalog>["data"],
): { label: string; value: string }[] {
  if (!catalog || !selections) return [];
  const out: { label: string; value: string }[] = [];
  for (const g of catalog.groups) {
    const raw = (selections as any)[g.code];
    if (raw === null || raw === undefined || raw === "" || raw === false) continue;
    const opts = catalog.byGroup[g.id] ?? [];
    const labelFor = (code: string) => opts.find((o) => o.code === code)?.label ?? code;
    let value = "";
    if (Array.isArray(raw)) {
      if (raw.length === 0) continue;
      value = raw.map((c) => labelFor(String(c))).join(", ");
    } else if (typeof raw === "boolean") {
      value = "Yes";
    } else {
      value = opts.length ? labelFor(String(raw)) : String(raw);
    }
    out.push({ label: g.label, value });
  }
  return out;
}

/** The styling brief: booking instructions, falling back to the pet's saved defaults. */
export function JobGroomingBrief({
  tenantId,
  bookingId,
  primaryPetId,
}: {
  tenantId: string;
  bookingId: string;
  primaryPetId: string | null;
}) {
  const catalogQ = useInstructionCatalog(tenantId);
  const bookingQ = useBookingInstructions(bookingId);
  const petQ = usePetGroomingDefaults(primaryPetId);

  const bookingRows = selectionLines(bookingQ.data?.selections, catalogQ.data);
  const bookingHas =
    bookingRows.length > 0 ||
    (bookingQ.data?.medical_flags?.length ?? 0) > 0 ||
    Boolean(bookingQ.data?.notes?.trim());

  const source = bookingHas ? bookingQ.data : petQ.data;
  const rows = bookingHas ? bookingRows : selectionLines(petQ.data?.selections, catalogQ.data);
  const flags = source?.medical_flags ?? [];
  const notes = source?.notes ?? "";
  const toldOffice = bookingHas ? (bookingQ.data as any)?.told_office_to_call ?? "" : "";

  const anything = rows.length > 0 || flags.length > 0 || Boolean(notes?.trim());

  if (bookingQ.isLoading || catalogQ.isLoading) {
    return (
      <Card title="Grooming brief" icon={Scissors}>
        <p className="text-sm text-muted-foreground">Loading…</p>
      </Card>
    );
  }

  if (bookingQ.isError || catalogQ.isError || petQ.isError) {
    return (
      <Card tone="warn" title="Grooming brief unavailable" icon={AlertTriangle}>
        <p className="text-sm font-semibold">The styling preferences could not be loaded. Call the office before you start.</p>
      </Card>
    );
  }

  if (!anything) {
    return (
      <Card tone="warn" title="Grooming brief" icon={AlertTriangle}>
        <p className="text-sm font-semibold">
          No styling preferences captured for this groom. Call the office before you start.
        </p>
      </Card>
    );
  }

  const medicalLabel = (code: string) => {
    for (const g of catalogQ.data?.groups ?? []) {
      const hit = (catalogQ.data?.byGroup[g.id] ?? []).find((o) => o.code === code);
      if (hit) return hit.label;
    }
    return code;
  };

  return (
    <Card title="Grooming brief" icon={Scissors}>
      {!bookingHas && (
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">From pet profile</p>
      )}
      <dl className="space-y-2 text-sm">
        {rows.map((r) => (
          <div key={r.label} className="flex flex-wrap gap-x-2">
            <dt className="font-semibold text-muted-foreground">{r.label}:</dt>
            <dd className="font-semibold">{r.value}</dd>
          </div>
        ))}
      </dl>
      {flags.length > 0 && (
        <div className="mt-3 rounded-xl border border-sk-orange bg-sk-orange-soft p-3 text-sm text-sk-orange">
          <div className="font-bold">Medical flags</div>
          <div className="mt-1">{flags.map(medicalLabel).join(", ")}</div>
        </div>
      )}
      {notes?.trim() && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notes</div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{notes}</p>
        </div>
      )}
      {toldOffice?.trim() && (
        <div className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Told office to call</div>
          <p className="mt-1 text-sm">{toldOffice}</p>
        </div>
      )}
    </Card>
  );
}

/** What was sold: package, add-ons, extras. */
export function JobService({
  details,
  addons,
  pet,
}: {
  details: WorkJobGroomingDetails | null;
  addons: WorkJobAddon[];
  pet: WorkJobPet | undefined;
}) {
  const size = (pet?.size_override || pet?.size) as PetSize | undefined;
  const bits: string[] = [];
  if (details?.duration_minutes) bits.push(`${details.duration_minutes} min`);
  if (size) bits.push(`Size ${PET_SIZE_LABEL[size] ?? size}${pet?.size_override ? " (override)" : ""}`);
  if (details?.groomer_name) bits.push(details.groomer_name);

  const hasAny = Boolean(details?.service_package) || addons.length > 0 || bits.length > 0;
  if (!hasAny) return null;

  return (
    <Card title="Service" icon={Sparkles}>
      <div className="text-base font-bold">{details?.service_package ?? "Groom"}</div>
      {bits.length > 0 && <div className="mt-1 text-sm text-muted-foreground">{bits.join(" · ")}</div>}
      {details?.grooming_notes?.trim() && (
        <div className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Grooming notes</div>
          <p className="mt-1 whitespace-pre-wrap font-medium">{details.grooming_notes}</p>
        </div>
      )}
      {addons.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {addons.map((a) => (
            <li key={a.id} className="flex justify-between gap-3">
              <span className="font-semibold">
                {a.addon_name ?? "Add-on"}
                {a.qty && a.qty > 1 ? ` ×${a.qty}` : ""}
              </span>
              {a.price_zar_snapshot != null && <span className="text-muted-foreground">R{Number(a.price_zar_snapshot).toFixed(0)}</span>}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
        {details?.stay_and_play_after && (
          <span className="rounded-full bg-sk-turquoise-soft px-2.5 py-1 text-sk-turquoise-dark">Stay &amp; Play after</span>
        )}
        {Number(details?.travel_fee ?? 0) > 0 && (
          <span className="rounded-full bg-muted px-2.5 py-1">Travel fee R{Number(details?.travel_fee).toFixed(0)}</span>
        )}
        {Number(details?.matted_surcharge_zar ?? 0) > 0 && (
          <span className="rounded-full bg-sk-orange-soft px-2.5 py-1 text-sk-orange">Matted surcharge</span>
        )}
        {details?.pensioner_discount_applied && (
          <span className="rounded-full bg-muted px-2.5 py-1">Pensioner discount</span>
        )}
        {Number(details?.hotel_checkout_discount_pct ?? 0) > 0 && (
          <span className="rounded-full bg-muted px-2.5 py-1">
            Hotel checkout −{Number(details?.hotel_checkout_discount_pct)}%
          </span>
        )}
      </div>
    </Card>
  );
}
