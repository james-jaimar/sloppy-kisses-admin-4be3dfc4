import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Search, AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCustomers, useCustomerPets } from "@/features/customers/queries";
import {
  useCreateBooking,
  useUpdateBooking,
  useResources,
  type BookingListRow,
  type ServiceType,
  type BookingStatus,
  type ResourceType,
} from "./queries";
import {
  serviceKind,
  useBookingServiceDetails,
  useResourceConflicts,
  useUpsertBookingDetails,
  type GroomingDetails,
  type HotelDetails,
  type TransportDetails,
} from "./detailsQueries";
import { GroomingFields, TransportFields } from "./BookingDetailsFields";
import { RecurrenceFields, DEFAULT_RECURRENCE, toRule, type RecurrenceValue } from "./RecurrenceFields";
import { useCreateRecurringBooking } from "./recurringQueries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HotelExtrasPanel, type SurchargeSelection } from "./HotelExtrasPanel";
import { HotelCapacityNotice, type CapacityIssue } from "@/features/hotelCattery/HotelCapacityNotice";
import { useSetBookingHotelSurcharges } from "@/features/settings/hotelRateCardQueries";
import { GroomingExtrasPanel, type GroomingAddonSelection } from "./GroomingExtrasPanel";
import { GroomingSlotPicker } from "@/features/grooming/GroomingSlotPicker";
import { effectivePetSize } from "@/features/pets/sizeUtils";
import { useSetBookingGroomingAddons } from "@/features/grooming/workflowQueries";
import { useGroomingAddons } from "@/features/settings/groomingRateCardQueries";
import { useGroomingPackages } from "@/features/settings/groomingRateCardQueries";
import { BookingGroomingInstructionsPanel } from "@/features/grooming/instructions/BookingGroomingInstructionsPanel";
import { useSaveBookingInstructions } from "@/features/grooming/instructions/queries";
import { useInstructionCatalog } from "@/features/grooming/instructions/queries";
import type { GroomingInstructionsValue } from "@/features/grooming/instructions/GroomingInstructionsForm";
import {
  AcknowledgementSection,
  AttachmentsSection,
  CareSection,
  EmergencySection,
  OwnerSection,
  PetSections,
  StayWindowSection,
  VetSection,
  buildAccommodationForm,
  emptyAccommodationForm,
  syncFormPets,
} from "@/features/hotelForm/AccommodationFields";
import {
  useAccommodationCustomer,
  useAccommodationPets,
  useAccommodationWriteBack,
} from "@/features/hotelForm/prefillQueries";
import {
  useAccommodationForm,
  CHECK_IN_TIME,
  checkOutTimeFor,
  isStayPlayWindow,
  type AccommodationFormPayload,
} from "@/features/hotelForm/accommodationForm";
import { GuidelinesSection } from "@/features/hotelForm/GuidelinesSection";
import { supabase } from "@/lib/supabase/client";

const SERVICE_TYPES: { value: ServiceType; label: string; resourceType?: ResourceType }[] = [
  { value: "daycare", label: "Daycare", resourceType: "daycare_area" },
  { value: "daycare_assessment", label: "Daycare assessment", resourceType: "daycare_area" },
  { value: "hotel_dog", label: "Hotel — dog", resourceType: "hotel_area" },
  { value: "hotel_cat", label: "Hotel — cat", resourceType: "cattery_area" },
  { value: "grooming_inhouse", label: "Grooming (in-house)", resourceType: "inhouse_grooming" },
  { value: "grooming_mobile", label: "Grooming (mobile)", resourceType: "mobile_van" },
  { value: "pickup_dropoff", label: "Pick up / drop-off", resourceType: "transport_vehicle" },
];

const RESOURCE_LABELS: Record<ServiceType, string> = {
  daycare: "Area",
  daycare_assessment: "Area",
  hotel_dog: "Kennel / suite",
  hotel_cat: "Cattery unit",
  grooming_inhouse: "Groomer / station",
  grooming_mobile: "Van",
  pickup_dropoff: "Vehicle",
};

/** Presets shown in the Duration select. `mins` null = "Custom…" */
const DURATION_PRESETS: Record<ServiceType, { label: string; mins: number }[]> = {
  daycare:            [{ label: "Full day (08:00–17:00)", mins: 540 }, { label: "Half day (4h)", mins: 240 }],
  daycare_assessment: [{ label: "1 hour", mins: 60 }, { label: "90 min", mins: 90 }],
  hotel_dog:          [], // uses nights
  hotel_cat:          [], // uses nights
  grooming_inhouse:   [{ label: "15 min", mins: 15 }, { label: "1 hour", mins: 60 }],
  grooming_mobile:    [{ label: "15 min", mins: 15 }, { label: "1 hour", mins: 60 }],
  pickup_dropoff:     [{ label: "15 min", mins: 15 }, { label: "30 min", mins: 30 }, { label: "1 hour", mins: 60 }],
};

const DEFAULT_DURATION: Record<ServiceType, number> = {
  daycare: 540, daycare_assessment: 60, hotel_dog: 24 * 60, hotel_cat: 24 * 60,
  grooming_inhouse: 60, grooming_mobile: 60, pickup_dropoff: 30,
};

const STATUSES: BookingStatus[] = [
  "draft", "requested", "needs_info", "approved", "confirmed",
  "checked_in", "in_progress", "ready", "checked_out", "completed", "cancelled", "no_show",
];

function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function diffMinutes(startIso: string | null | undefined, endIso: string | null | undefined): number | null {
  if (!startIso || !endIso) return null;
  return Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 60000);
}

interface Props {
  tenantId: string;
  onClose: () => void;
  onSaved?: (id: string) => void;
  booking?: BookingListRow | null; // if provided, edit mode
  prefill?: Partial<{
    customer_id: string;
    pet_ids: string[];
    service_type: ServiceType;
    start_at: string;
    end_at: string;
    notes_customer: string | null;
    grooming: Partial<GroomingDetails>;
    hotel: Partial<HotelDetails>;
    transport: Partial<TransportDetails>;
    grooming_instructions: {
      selections: Record<string, any>;
      medical_flags: string[];
      notes: string;
    } | null;
  }>;
}

const inputCls = "h-10 w-full rounded-lg border border-border bg-white px-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40";

export function BookingFormModal({ tenantId, onClose, onSaved, booking, prefill }: Props) {
  const isEdit = Boolean(booking);
  const [customerId, setCustomerId] = useState<string | null>(
    booking?.customer_id ?? prefill?.customer_id ?? null,
  );
  const [petIds, setPetIds] = useState<string[]>(
    booking ? booking.booking_pets.map((bp) => bp.pet?.id ?? "").filter(Boolean) : prefill?.pet_ids ?? [],
  );
  const [customerSearch, setCustomerSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>(
    booking?.service_type ?? prefill?.service_type ?? "daycare",
  );
  const [status, setStatus] = useState<BookingStatus>(booking?.status ?? "confirmed");
  const [startAt, setStartAt] = useState<string>(
    toLocalInput(booking?.start_at ?? prefill?.start_at ?? null),
  );
  // Duration (in minutes) drives end_at. For hotel we prefer nights.
  const initialDurationMins =
    diffMinutes(booking?.start_at, booking?.end_at) ??
    diffMinutes(prefill?.start_at, prefill?.end_at) ??
    DEFAULT_DURATION[booking?.service_type ?? prefill?.service_type ?? "daycare"];
  const [durationMins, setDurationMins] = useState<number>(initialDurationMins);
  const [customDuration, setCustomDuration] = useState<boolean>(() => {
    const st = booking?.service_type ?? prefill?.service_type ?? "daycare";
    const presets = DURATION_PRESETS[st] ?? [];
    return presets.length > 0 && !presets.some((p) => p.mins === initialDurationMins);
  });
  const [resourceId, setResourceId] = useState<string | null>(booking?.resource_id ?? null);
  const [notesInternal, setNotesInternal] = useState(booking?.notes_internal ?? "");
  const [notesCustomer, setNotesCustomer] = useState(
    booking?.notes_customer ?? prefill?.notes_customer ?? "",
  );

  // When service type changes (new booking only), reset duration to that service's default.
  useEffect(() => {
    if (isEdit) return;
    setDurationMins(DEFAULT_DURATION[serviceType]);
    setCustomDuration(false);
  }, [serviceType, isEdit]);

  // Derived end iso string for downstream panels (hotel occupancy, conflicts).
  const endAtLocal = useMemo(() => {
    if (!startAt) return "";
    const start = new Date(startAt);
    const end = new Date(start.getTime() + durationMins * 60000);
    return toLocalInput(end.toISOString());
  }, [startAt, durationMins]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(customerSearch), 250);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const customersQ = useCustomers({ tenantId, search: debouncedSearch, pageSize: 25 });
  const petsQ = useCustomerPets(customerId, tenantId);

  // When creating a new booking, auto-select all of the chosen customer's pets
  // as soon as they load. Editing keeps the booking's existing pet selection.
  useEffect(() => {
    if (isEdit) return;
    if (!customerId) return;
    if (!petsQ.data) return;
    if (petIds.length > 0) return; // don't overwrite prefilled or user-toggled state
    if (petsQ.data.length === 0) return;
    setPetIds(petsQ.data.map((p) => p.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId, petsQ.data, isEdit]);
  const resourcesQ = useResources(tenantId);
  const packagesQ = useGroomingPackages(tenantId, { activeOnly: true });
  const create = useCreateBooking(tenantId);
  const update = useUpdateBooking(tenantId);
  const upsertDetails = useUpsertBookingDetails(tenantId);
  const createRecurring = useCreateRecurringBooking(tenantId);

  // Service-typed details state
  const kind = serviceKind(serviceType);
  const [grooming, setGrooming] = useState<Partial<GroomingDetails>>(
    !isEdit && prefill?.grooming ? prefill.grooming : {},
  );
  const [hotel, setHotel] = useState<Partial<HotelDetails>>(
    !isEdit && prefill?.hotel ? prefill.hotel : {},
  );
  const [transport, setTransport] = useState<Partial<TransportDetails>>(
    !isEdit && prefill?.transport ? prefill.transport : {},
  );
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(DEFAULT_RECURRENCE);
  const [hotelSurcharges, setHotelSurcharges] = useState<SurchargeSelection[]>([]);
  const [capacityIssue, setCapacityIssue] = useState<CapacityIssue | null>(null);
  const setBookingSurcharges = useSetBookingHotelSurcharges(tenantId);
  const [groomingAddons, setGroomingAddons] = useState<GroomingAddonSelection[]>([]);
  const setBookingGroomingAddons = useSetBookingGroomingAddons(tenantId);
  const addonsCatalogQ = useGroomingAddons(tenantId, { activeOnly: true });
  const [groomingInstructions, setGroomingInstructions] = useState<GroomingInstructionsValue>({
    selections: (!isEdit && prefill?.grooming_instructions?.selections) || {},
    medical_flags: (!isEdit && prefill?.grooming_instructions?.medical_flags) || [],
    notes: (!isEdit && prefill?.grooming_instructions?.notes) || "",
    told_office_to_call: "",
  });
  const saveInstructions = useSaveBookingInstructions(tenantId);

  // ---- Accommodation (hotel intake) form, captured inline with the booking ----
  const [accom, setAccom] = useState<AccommodationFormPayload>(emptyAccommodationForm());
  const [accomSeeded, setAccomSeeded] = useState(false);
  const [accomTouched, setAccomTouched] = useState(false);
  const accomCustomerQ = useAccommodationCustomer(kind === "hotel" ? customerId || null : null);
  const accomPetsQ = useAccommodationPets(kind === "hotel" ? petIds : []);
  const existingAccomQ = useAccommodationForm(kind === "hotel" && isEdit ? booking?.id ?? null : null);
  const accomWriteBack = useAccommodationWriteBack();

  useEffect(() => {
    if (kind !== "hotel") return;
    if (accomSeeded) return;
    if (!accomCustomerQ.data) return;
    if (isEdit && existingAccomQ.isLoading) return;
    setAccom(
      buildAccommodationForm({
        customer: accomCustomerQ.data,
        pets: accomPetsQ.data ?? [],
        saved: existingAccomQ.data?.payload ?? null,
      }),
    );
    setAccomSeeded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, accomSeeded, accomCustomerQ.data, existingAccomQ.data, existingAccomQ.isLoading, isEdit]);

  // Reseed when the customer changes on a new booking.
  useEffect(() => {
    if (!isEdit) setAccomSeeded(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  useEffect(() => {
    if (kind !== "hotel" || !accomPetsQ.data) return;
    setAccom((f) => syncFormPets(f, accomPetsQ.data));
  }, [kind, accomPetsQ.data]);

  function patchAccom(next: AccommodationFormPayload) {
    setAccomTouched(true);
    setAccom(next);
  }

  async function persistAccommodation(bookingId: string) {
    if (kind !== "hotel") return;
    if (!accomTouched && !accom.pets.length) return;
    try {
      const payload: AccommodationFormPayload = {
        ...accom,
        acknowledgement: accom.acknowledgement.accepted
          ? { ...accom.acknowledgement, signed_at: accom.acknowledgement.signed_at || new Date().toISOString() }
          : accom.acknowledgement,
      };
      const { error } = await supabase.rpc("submit_accommodation_form", {
        p_booking_id: bookingId,
        p_payload: payload as unknown as never,
      });
      if (error) throw error;
      if (customerId) await accomWriteBack.mutateAsync({ customerId, form: payload });
    } catch (err: any) {
      toast.error("Booking saved, but the accommodation form did not save: " + (err?.message ?? "unknown error"));
    }
  }
  const instrCatalogQ = useInstructionCatalog(tenantId);

  // Auto-add priced add-ons when an instruction option carries an addon_code.
  // Instructions are the source of truth for any add-on that has a linked
  // instruction option: we add when triggered AND remove when un-ticked so the
  // two panels can't disagree. Standalone add-ons (travel, pickup, Stay & Play,
  // toothbrush purchase) are untouched here.
  useEffect(() => {
    const cat = instrCatalogQ.data;
    const addons = addonsCatalogQ.data;
    if (!cat || !addons) return;
    const triggered = new Set<string>();
    for (const g of cat.groups) {
      const val = groomingInstructions.selections[g.code];
      if (g.kind === "bool" && val) {
        // Special-case: hand_strip boolean → hand_strip addon
        if (g.code === "hand_strip" && addons.some((a) => a.code === "hand_strip")) {
          triggered.add("hand_strip");
        }
      }
      const opts = cat.byGroup[g.id] ?? [];
      if (g.kind === "single" && typeof val === "string") {
        const opt = opts.find((o) => o.code === val);
        if (opt?.addon_code) triggered.add(opt.addon_code);
      }
      if (g.kind === "multi" && Array.isArray(val)) {
        for (const code of val) {
          const opt = opts.find((o) => o.code === code);
          if (opt?.addon_code) triggered.add(opt.addon_code);
        }
      }
    }
    // Build the full set of codes that can ever be linked to an instruction option.
    const linkedCodes = new Set<string>();
    for (const o of cat.options) if (o.addon_code) linkedCodes.add(o.addon_code);
    linkedCodes.add("hand_strip");
    // Resolve triggered codes → addon ids, and linked codes → addon ids.
    const triggeredIds = new Set<string>();
    for (const code of triggered) {
      const a = addons.find((x) => x.code === code);
      if (a) triggeredIds.add(a.id);
    }
    const linkedIds = new Set<string>();
    for (const code of linkedCodes) {
      const a = addons.find((x) => x.code === code);
      if (a) linkedIds.add(a.id);
    }
    setGroomingAddons((prev) => {
      // Drop any linked addon that is no longer triggered; keep everything else.
      const kept = prev.filter((s) => !linkedIds.has(s.addon_id) || triggeredIds.has(s.addon_id));
      const have = new Set(kept.map((s) => s.addon_id));
      const additions: GroomingAddonSelection[] = [];
      for (const id of triggeredIds) if (!have.has(id)) additions.push({ addon_id: id, qty: 1 });
      if (kept.length === prev.length && additions.length === 0) return prev;
      return [...kept, ...additions];
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groomingInstructions.selections, instrCatalogQ.data, addonsCatalogQ.data]);

  // Load existing details when editing
  const detailsQ = useBookingServiceDetails(
    isEdit ? booking?.id ?? null : null,
    serviceType,
    tenantId,
  );
  useEffect(() => {
    if (!isEdit || !detailsQ.data) return;
    if (detailsQ.data.kind === "grooming" && detailsQ.data.data) setGrooming(detailsQ.data.data);
    if (detailsQ.data.kind === "hotel" && detailsQ.data.data) setHotel(detailsQ.data.data);
    if (detailsQ.data.kind === "transport" && detailsQ.data.data) setTransport(detailsQ.data.data);
  }, [isEdit, detailsQ.data]);

  // Resource conflict soft-check
  const startIso = startAt ? new Date(startAt).toISOString() : null;
  const endIso = endAtLocal ? new Date(endAtLocal).toISOString() : null;
  const conflictsQ = useResourceConflicts({
    tenantId,
    resourceId,
    startAt: startIso,
    endAt: endIso,
    excludeBookingId: booking?.id ?? null,
  });
  const conflicts = conflictsQ.data ?? [];

  const selectedCustomer = useMemo(() => {
    if (booking?.customer && booking.customer.id === customerId) return booking.customer;
    return customersQ.data?.rows.find((c) => c.id === customerId) ?? null;
  }, [customersQ.data, customerId, booking]);

  const resourceType = SERVICE_TYPES.find((s) => s.value === serviceType)?.resourceType;
  const filteredResources = (resourcesQ.data ?? []).filter(
    (r) => !resourceType || r.type === resourceType,
  );
  const confirm = useConfirm();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return toast.error("Please select a customer");
    if (!startAt) return toast.error("Please pick a start time");
    if (!durationMins || durationMins <= 0) return toast.error("Please set a duration");
    const endComputed = new Date(new Date(startAt).getTime() + durationMins * 60000);
    if ((petsQ.data?.length ?? 0) > 0 && petIds.length === 0) {
      return toast.error("Select at least one pet for this booking");
    }

    if (conflicts.length > 0) {
      const proceed = await confirm({
        title: "Resource already booked in this window",
        description: `Overlaps with ${conflicts.map((c: any) => c.booking_number).join(", ")}. Save anyway?`,
        confirmLabel: "Save anyway",
        tone: "destructive",
      });
      if (!proceed) return;
    }

    if (kind === "hotel" && capacityIssue) {
      const nights = capacityIssue.nights.length;
      if (capacityIssue.mode === "block") {
        return toast.error(
          `${capacityIssue.resourceName} is full (${capacityIssue.capacity} spaces) on ${nights} ${nights === 1 ? "night" : "nights"}. Pick another area or change the dates.`,
        );
      }
      const proceed = await confirm({
        title: "Over capacity",
        description: `${capacityIssue.resourceName} would exceed its ${capacityIssue.capacity} spaces on ${nights} ${nights === 1 ? "night" : "nights"}. Save anyway?`,
        confirmLabel: "Save anyway",
        tone: "destructive",
      });
      if (!proceed) return;
    }

    try {
      if (isEdit && booking) {
        await update.mutateAsync({
          id: booking.id,
          patch: {
            service_type: serviceType,
            status,
            start_at: new Date(startAt).toISOString(),
            end_at: endComputed.toISOString(),
            resource_id: resourceId,
            notes_internal: notesInternal.trim() || null,
            notes_customer: notesCustomer.trim() || null,
          },
          pet_ids: petIds,
        });
        await saveDetails(booking.id);
        if (kind === "hotel") await persistSurcharges(booking.id);
        if (kind === "hotel") await persistAccommodation(booking.id);
        if (kind === "grooming") await persistGroomingAddons(booking.id);
        if (kind === "grooming") await persistInstructions(booking.id);
        toast.success("Booking updated");
        onSaved?.(booking.id);
      } else {
        const rule = toRule(recurrence);
        if (rule) {
          const res = await createRecurring.mutateAsync({
            customer_id: customerId,
            pet_ids: petIds,
            service_type: serviceType,
            status,
            start_at: new Date(startAt).toISOString(),
            end_at: endComputed.toISOString(),
            resource_id: resourceId,
            notes_internal: notesInternal.trim() || null,
            notes_customer: notesCustomer.trim() || null,
            rule,
          });
          // Persist service-typed details for every occurrence.
          for (const b of res.bookings) {
            await saveDetails(b.id);
            if (kind === "hotel") await persistSurcharges(b.id);
            if (kind === "hotel") await persistAccommodation(b.id);
            if (kind === "grooming") await persistGroomingAddons(b.id);
            if (kind === "grooming") await persistInstructions(b.id);
          }
          toast.success(`Created ${res.bookings.length} bookings in series`);
          onSaved?.(res.bookings[0]?.id);
          onClose();
          return;
        }
        const res = await create.mutateAsync({
          customer_id: customerId,
          pet_ids: petIds,
          service_type: serviceType,
          status,
          start_at: new Date(startAt).toISOString(),
          end_at: endComputed.toISOString(),
          resource_id: resourceId,
          notes_internal: notesInternal.trim() || null,
          notes_customer: notesCustomer.trim() || null,
        });
        await saveDetails(res.id);
        if (kind === "hotel") await persistSurcharges(res.id);
        if (kind === "hotel") await persistAccommodation(res.id);
        if (kind === "grooming") await persistGroomingAddons(res.id);
        if (kind === "grooming") await persistInstructions(res.id);
        toast.success(`Booking ${res.booking_number} created`);
        onSaved?.(res.id);
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Failed to save booking");
    }
  }

  async function saveDetails(bookingId: string) {
    if (kind === "grooming") {
      // Source service_package label from selected rate-card package so we
      // don't double-enter it on the form. Duration lives on the booking
      // itself but we still stamp duration_minutes on the details row.
      const pkg = (packagesQ.data ?? []).find((p) => p.id === grooming.package_id);
      await upsertDetails.mutateAsync({
        kind: "grooming",
        bookingId,
        data: {
          ...grooming,
          grooming_mode: serviceType === "grooming_mobile" ? "mobile" : "inhouse",
          service_package: pkg?.name ?? grooming.service_package ?? null,
          duration_minutes: durationMins,
        },
      });
    } else if (kind === "hotel") {
      await upsertDetails.mutateAsync({ kind: "hotel", bookingId, data: hotel });
    } else if (kind === "transport") {
      await upsertDetails.mutateAsync({ kind: "transport", bookingId, data: transport });
    }
  }

  async function persistSurcharges(bookingId: string) {
    try {
      await setBookingSurcharges.mutateAsync({
        bookingId,
        rows: hotelSurcharges.map((s) => ({
          surcharge_id: s.surcharge_id,
          quantity: s.quantity,
          price_override_zar: null,
        })),
      });
    } catch (err: any) {
      toast.error("Booking saved, but failed to save surcharges: " + (err?.message ?? "unknown error"));
    }
  }

  async function persistGroomingAddons(bookingId: string) {
    try {
      const catalog = addonsCatalogQ.data ?? [];
      const rows = groomingAddons.map((s) => {
        const cat = catalog.find((c) => c.id === s.addon_id);
        return {
          addon_id: s.addon_id,
          addon_code: cat?.code ?? null,
          addon_name: cat?.name ?? null,
          price_zar_snapshot: Number(cat?.price_zar ?? 0),
          qty: s.qty,
        };
      });
      await setBookingGroomingAddons.mutateAsync({ bookingId, rows });
    } catch (err: any) {
      toast.error("Booking saved, but failed to save add-ons: " + (err?.message ?? "unknown error"));
    }
  }

  async function persistInstructions(bookingId: string) {
    try {
      await saveInstructions.mutateAsync({
        booking_id: bookingId,
        selections: groomingInstructions.selections,
        medical_flags: groomingInstructions.medical_flags,
        notes: groomingInstructions.notes?.trim() || null,
        told_office_to_call: groomingInstructions.told_office_to_call?.trim() || null,
      });
    } catch (err: any) {
      toast.error("Booking saved, but failed to save instructions: " + (err?.message ?? "unknown error"));
    }
  }

  function togglePet(id: string) {
    setPetIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }

  const saving = create.isPending || update.isPending;
  const savingAny = saving || createRecurring.isPending;

  return (
    <ModalShell
      wide
      title={isEdit ? `Edit booking ${booking?.booking_number ?? ""}` : "New booking"}
      subtitle={isEdit ? "Update booking details" : "Create a confirmed booking on behalf of a customer"}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-6 p-6">
        {/* Customer */}
        <div>
          <div className="mb-1 text-sm font-medium">Customer</div>
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-lg border border-border bg-sk-surface-muted px-3 py-2 text-sm">
              <div>
                <div className="font-medium">{selectedCustomer.full_name ?? "Unnamed"}</div>
                <div className="text-xs text-muted-foreground">
                  {selectedCustomer.customer_number} · {selectedCustomer.email ?? "—"}
                </div>
              </div>
              {!isEdit && (
                <button
                  type="button"
                  onClick={() => {
                    setCustomerId(null);
                    setPetIds([]);
                  }}
                  className="text-xs text-sk-coral-dark hover:underline"
                >
                  Change
                </button>
              )}
            </div>
          ) : (
            <div className="rounded-lg border border-border">
              <div className="relative border-b border-border">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  autoFocus
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customer by name or number..."
                  className="h-10 w-full rounded-t-lg bg-white pl-9 pr-3 text-sm outline-none"
                />
              </div>
              <ul className="max-h-56 overflow-y-auto">
                {customersQ.isLoading && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">Loading…</li>
                )}
                {!customersQ.isLoading && (customersQ.data?.rows.length ?? 0) === 0 && (
                  <li className="px-3 py-2 text-sm text-muted-foreground">No customers found.</li>
                )}
                {customersQ.data?.rows.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setCustomerId(c.id);
                        setPetIds([]);
                      }}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-sk-surface-muted"
                    >
                      <div>
                        <div className="font-medium">{c.full_name ?? "Unnamed"}</div>
                        <div className="text-xs text-muted-foreground">
                          {c.customer_number} · {c.email ?? c.mobile ?? "—"}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Pets */}
        {customerId && (
          <div>
            <div className="mb-1 text-sm font-medium">Pets</div>
            {(petsQ.data?.length ?? 0) === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">
                This customer has no pets yet.
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {petsQ.data?.map((p) => {
                  const active = petIds.includes(p.id);
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => togglePet(p.id)}
                      className={
                        "rounded-full border px-3 py-1 text-xs font-medium transition-colors " +
                        (active
                          ? "border-sk-coral bg-sk-coral text-white"
                          : "border-border bg-white text-foreground hover:bg-muted")
                      }
                    >
                      {p.name} {p.pet_number ? `· ${p.pet_number}` : ""}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1 text-sm font-medium">Service type</div>
            <select
              value={serviceType}
              onChange={(e) => {
                setServiceType(e.target.value as ServiceType);
                setResourceId(null);
              }}
              className={inputCls}
            >
              {SERVICE_TYPES.map((s) => (
                <option key={s.value} value={s.value}>{s.label}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Status</div>
            <select value={status} onChange={(e) => setStatus(e.target.value as BookingStatus)} className={inputCls}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">Start</div>
            {kind === "hotel" ? (
              <>
                <input
                  type="date"
                  value={startAt ? startAt.slice(0, 10) : ""}
                  onChange={(e) => setStartAt(e.target.value ? `${e.target.value}T${CHECK_IN_TIME}` : "")}
                  className={inputCls}
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Arrivals 09:00–11:00 only</div>
              </>
            ) : (
              <input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className={inputCls} />
            )}
          </div>
          <div>
            <div className="mb-1 text-sm font-medium">
              {kind === "hotel" ? "Nights" : "Duration"}
            </div>
            {kind === "hotel" ? (
              <input
                type="number"
                min={1}
                step={1}
                value={Math.max(1, Math.round(durationMins / (24 * 60)))}
                onChange={(e) => setDurationMins(Math.max(1, Number(e.target.value)) * 24 * 60)}
                className={inputCls}
              />
            ) : customDuration ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  min={5}
                  step={5}
                  value={durationMins}
                  onChange={(e) => setDurationMins(Math.max(5, Number(e.target.value)))}
                  className={inputCls}
                />
                <button
                  type="button"
                  onClick={() => {
                    setCustomDuration(false);
                    setDurationMins(DEFAULT_DURATION[serviceType]);
                  }}
                  className="h-10 shrink-0 rounded-lg border border-border px-3 text-xs font-medium text-muted-foreground hover:bg-muted"
                >
                  Presets
                </button>
              </div>
            ) : (
              <select
                value={String(durationMins)}
                onChange={(e) => {
                  if (e.target.value === "__custom__") {
                    setCustomDuration(true);
                    return;
                  }
                  setDurationMins(Number(e.target.value));
                }}
                className={inputCls}
              >
                {(DURATION_PRESETS[serviceType] ?? []).map((p) => (
                  <option key={p.mins} value={p.mins}>{p.label}</option>
                ))}
                <option value="__custom__">Custom…</option>
              </select>
            )}
            {startAt && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Ends {new Date(new Date(startAt).getTime() + durationMins * 60000).toLocaleString("en-ZA", {
                  weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            )}
          </div>
          <div className="sm:col-span-2">
            <div className="mb-1 text-sm font-medium">{RESOURCE_LABELS[serviceType]}</div>
            <select
              value={resourceId ?? ""}
              onChange={(e) => setResourceId(e.target.value || null)}
              className={inputCls}
            >
              <option value="">— Unassigned —</option>
              {filteredResources.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
            {conflicts.length > 0 && (
              <div className="mt-2 flex items-start gap-2 rounded-lg border border-sk-orange bg-sk-orange-soft p-2 text-xs text-sk-orange">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div>
                  This resource overlaps with{" "}
                  <span className="font-semibold">
                    {conflicts.map((c: any) => c.booking_number).join(", ")}
                  </span>
                  . You can still save — you'll be asked to confirm.
                </div>
              </div>
            )}
            {kind === "hotel" && (
              <HotelCapacityNotice
                tenantId={tenantId}
                resourceId={resourceId}
                startAt={startIso}
                endAt={endIso}
                petCount={petIds.length || 1}
                excludeBookingId={booking?.id ?? null}
                onIssueChange={setCapacityIssue}
              />
            )}
          </div>
        </div>

        {kind === "grooming" && (
          <div className="mt-2">
            <div className="mb-1 text-sm font-medium">Pick a slot</div>
            <GroomingSlotPicker
              tenantId={tenantId}
              value={startAt || null}
              durationMinutes={durationMins}
              resourceId={resourceId}
              excludeBookingId={booking?.id ?? null}
              onChange={(startLocal, endLocal) => {
                if (startLocal) setStartAt(startLocal);
              }}
            />
          </div>
        )}

        {kind === "grooming" && (
          <GroomingFields
            value={grooming}
            onChange={(patch) => setGrooming((p) => ({ ...p, ...patch }))}
            mode={serviceType === "grooming_mobile" ? "mobile" : "inhouse"}
          />
        )}
        {kind === "grooming" && (
          <GroomingExtrasPanel
            tenantId={tenantId}
            bookingId={booking?.id ?? null}
            species={(petsQ.data?.find((p) => petIds.includes(p.id))?.species as any) === "cat" ? "cat" : "dog"}
            mode={serviceType === "grooming_mobile" ? "mobile" : "inhouse"}
            packageId={grooming.package_id ?? null}
            onPackageChange={(id) => setGrooming((p) => ({ ...p, package_id: id }))}
            addonSelection={groomingAddons}
            onAddonChange={setGroomingAddons}
            pensionerDiscount={grooming.pensioner_discount ?? false}
            mattedSurchargeZar={grooming.matted_surcharge_zar ?? null}
            sedationSurchargeZar={grooming.sedation_surcharge_zar ?? null}
            travelFee={grooming.travel_fee ?? null}
            petSize={effectivePetSize(petsQ.data?.find((p) => petIds.includes(p.id)) as any)}
          />
        )}
        {kind === "grooming" && (
          <BookingGroomingInstructionsPanel
            tenantId={tenantId}
            bookingId={booking?.id ?? null}
            primaryPetId={petIds[0] ?? null}
            value={groomingInstructions}
            onChange={setGroomingInstructions}
          />
        )}
        {kind === "hotel" && (
          <HotelExtrasPanel
            tenantId={tenantId}
            bookingId={booking?.id ?? null}
            species={serviceType === "hotel_cat" ? "cat" : "dog"}
            accommodationType={hotel.accommodation_type ?? ""}
            onAccommodationChange={(v) => setHotel((p) => ({ ...p, accommodation_type: v || null }))}
            startAt={startAt ? new Date(startAt).toISOString() : null}
            endAt={endAtLocal ? new Date(endAtLocal).toISOString() : null}
            petCount={petIds.length || 1}
            petIds={petIds}
            selection={hotelSurcharges}
            onSelectionChange={setHotelSurcharges}
          />
        )}
        {kind === "hotel" && (
          <div className="space-y-2 rounded-xl border border-border bg-muted/30 p-3">
            <div className="flex items-baseline justify-between gap-2">
              <div className="text-sm font-semibold">Accommodation form</div>
              <div className="text-xs text-muted-foreground">Prefilled from the customer & pet records</div>
            </div>
            <OwnerSection form={accom} setForm={patchAccom} collapsible />
            <EmergencySection form={accom} setForm={patchAccom} collapsible />
            <VetSection form={accom} setForm={patchAccom} collapsible />
            <StayWindowSection
              form={accom}
              setForm={patchAccom}
              collapsible
              checkOutDate={endAtLocal ? endAtLocal.slice(0, 10) : null}
            />
            <PetSections form={accom} setForm={patchAccom} collapsible />
            <CareSection form={accom} setForm={patchAccom} collapsible />
            <AttachmentsSection form={accom} setForm={patchAccom} collapsible />
            <GuidelinesSection tenantId={tenantId} collapsible />
            <AcknowledgementSection form={accom} setForm={patchAccom} collapsible />
          </div>
        )}
        {kind === "transport" && (
          <TransportFields
            value={transport}
            onChange={(patch) => setTransport((p) => ({ ...p, ...patch }))}
          />
        )}

        {!isEdit && (
          <RecurrenceFields
            value={recurrence}
            onChange={(patch) => setRecurrence((p) => ({ ...p, ...patch }))}
            anchorDate={startAt ? new Date(startAt) : null}
          />
        )}

        <div>
          <div className="mb-1 text-sm font-medium">Internal notes</div>
          <textarea
            value={notesInternal}
            onChange={(e) => setNotesInternal(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">Customer-facing notes</div>
          <textarea
            value={notesCustomer}
            onChange={(e) => setNotesCustomer(e.target.value)}
            rows={2}
            className="w-full rounded-lg border border-border bg-white p-3 text-sm outline-none focus:ring-2 focus:ring-sk-coral/40"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-border pt-4">
          <button type="button" onClick={onClose} className="h-10 rounded-lg border border-border px-4 text-sm font-medium hover:bg-muted">
            Cancel
          </button>
          <button
            type="submit"
            disabled={savingAny}
            className="h-10 rounded-lg bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark disabled:opacity-60"
          >
            {savingAny ? "Saving…" : isEdit ? "Save changes" : recurrence.enabled ? "Create series" : "Create booking"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}