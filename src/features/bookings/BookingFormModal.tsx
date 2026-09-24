import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { AlertTriangle, Plus } from "lucide-react";
import { PetFormModal } from "@/features/pets/PetFormModal";
import { ModalShell } from "@/components/modals/ModalShell";
import { useCustomerPets } from "@/features/customers/queries";
import { CustomerCombobox } from "@/components/customers/CustomerCombobox";
import { AddressSelector } from "@/features/customers/AddressSelector";
import { useRadiusCheck, ServiceRadiusNotice } from "@/features/transport/ServiceRadiusNotice";
import { VanLoadNotice, useTransportDayLoad, isRunFull } from "@/features/transport/VanLoadNotice";
import { useTransportWorkflowSettings } from "@/features/transport/queries";
import { useCustomerAddresses } from "@/features/customers/addressQueries";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
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
import { HealthGateList } from "@/features/pets/HealthGateBanner";
import { PetsVaccinationGate } from "./VaccinationGatePanel";
import { RecurrenceFields, DEFAULT_RECURRENCE, toRule, type RecurrenceValue } from "./RecurrenceFields";
import { useCreateRecurringBooking } from "./recurringQueries";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { HotelExtrasPanel, type SurchargeSelection } from "./HotelExtrasPanel";
import { usePublicHolidays, movementBlockReason, MOVEMENT_RULES_NOTE } from "@/features/hotelForm/dayRules";
import { HotelCapacityNotice, type CapacityIssue } from "@/features/hotelCattery/HotelCapacityNotice";
import { useSetBookingHotelSurcharges } from "@/features/settings/hotelRateCardQueries";
import { GroomingExtrasPanel, type GroomingAddonSelection } from "./GroomingExtrasPanel";
import { GroomingSlotPicker } from "@/features/grooming/GroomingSlotPicker";
import { useGroomingDayAvailability } from "@/features/grooming/availabilityQueries";
import { freeResourcesAt, layoutGroomingAppointments, type PetSlotRequest } from "@/features/grooming/multiPetSchedule";
import {
  applyInstructionAddons,
  clockOf,
  moveToDay,
  planDogTimes,
  EMPTY_INSTRUCTIONS,
  type DogPlan,
  type TimingMode,
} from "@/features/grooming/booking/dogPlan";
import {
  GroomingRepeatFields,
  DEFAULT_GROOM_REPEAT,
  repeatDates,
  type GroomRepeatValue,
} from "@/features/grooming/booking/GroomingRepeatFields";

const EDIT_KEY = "__booking__";
import { effectivePetSize } from "@/features/pets/sizeUtils";
import { useSetBookingGroomingAddons } from "@/features/grooming/workflowQueries";
import { useGroomingPackages, useGroomingAddons } from "@/features/settings/groomingRateCardQueries";
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
  daycare:            [{ label: "All day (08:00 – 17:00)", mins: 540 }, { label: "Half day (08:00 – 12:00)", mins: 240 }],
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

/** Daycare runs to fixed times, so the form never asks for a start time. */
const DAYCARE_START_TIME = "08:00";

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
  const [serviceType, setServiceType] = useState<ServiceType>(
    booking?.service_type ?? prefill?.service_type ?? "daycare",
  );
  /** petId -> accommodation type for hotel stays with pets in different areas. */
  const [petAcc, setPetAcc] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const bp of booking?.booking_pets ?? []) {
      const acc = (bp as any).accommodation_type as string | null | undefined;
      if (bp.pet?.id && acc) seed[bp.pet.id] = acc;
    }
    return seed;
  });
  const [status, setStatus] = useState<BookingStatus>(booking?.status ?? "confirmed");
  const isDaycare = serviceType === "daycare" || serviceType === "daycare_assessment";
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

  // Daycare has fixed times — force the start clock to the day start.
  useEffect(() => {
    if (!isDaycare || !startAt) return;
    const wanted = `${startAt.slice(0, 10)}T${DAYCARE_START_TIME}`;
    if (startAt !== wanted) setStartAt(wanted);
  }, [isDaycare, startAt]);

  // Derived end iso string for downstream panels (hotel occupancy, conflicts).
  const endAtLocal = useMemo(() => {
    if (!startAt) return "";
    const start = new Date(startAt);
    const end = new Date(start.getTime() + durationMins * 60000);
    return toLocalInput(end.toISOString());
  }, [startAt, durationMins]);

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
  const holidaysQ = usePublicHolidays(tenantId);
  const [capacityIssue, setCapacityIssue] = useState<CapacityIssue | null>(null);
  const [serviceAddressId, setServiceAddressId] = useState<string | null>(
    booking?.service_address_id ?? null,
  );
  // Mobile van bookings need an address the vans can actually navigate to.
  const isMobileVan = serviceType === "grooming_mobile";
  const { hasPermission, profile } = useCurrentUser();
  const [addingPet, setAddingPet] = useState(false);
  const canCreatePet = profile?.user_type === "platform" || hasPermission("pets.create");
  const canOverrideAddress = profile?.user_type === "platform" || hasPermission("settings.manage");
  const isTransport = serviceType === "pickup_dropoff";
  const needsVanAddress = isMobileVan || isTransport;
  const vanAddressesQ = useCustomerAddresses(needsVanAddress ? customerId || null : null, tenantId);
  const selectedVanAddress = (vanAddressesQ.data ?? []).find((a) => a.id === serviceAddressId) ?? null;
  const vanAddressVerified = Boolean(selectedVanAddress?.google_place_id);
  const radiusQ = useRadiusCheck(
    needsVanAddress ? tenantId : null,
    (selectedVanAddress as any)?.latitude ?? null,
    (selectedVanAddress as any)?.longitude ?? null,
  );
  const radiusBlocked = Boolean(
    radiusQ.data?.has_base && radiusQ.data.outside && radiusQ.data.gate_mode === "block",
  );
  const transportSettingsQ = useTransportWorkflowSettings(isTransport ? tenantId : null);
  const transportLoadQ = useTransportDayLoad({
    tenantId: isTransport ? tenantId : null,
    date: isTransport && startAt ? startAt.slice(0, 10) : null,
    excludeBookingId: booking?.id ?? null,
    enabled: isTransport,
  });
  const transportRunFull = isTransport && isRunFull(transportLoadQ.data);
  const [addressOverride, setAddressOverride] = useState(false);
  const [closureOverride, setClosureOverride] = useState<boolean>(
    (booking as any)?.closure_override ?? false,
  );
  // Closure lookup for the chosen day — the DB blocks bookings on closed days
  // unless staff tick the override.
  const bookingDay = startAt ? startAt.slice(0, 10) : null;
  const closureQ = useQuery({
    queryKey: ["closure-check", tenantId, bookingDay, serviceType],
    enabled: Boolean(tenantId && bookingDay),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("closures")
        .select("id, name, services, bill_anyway")
        .eq("tenant_id", tenantId)
        .lte("start_date", bookingDay!)
        .gte("end_date", bookingDay!);
      if (error) throw error;
      return (data ?? []).find(
        (c) => !c.services?.length || c.services.includes(serviceType) || c.services.includes("all"),
      ) ?? null;
    },
  });
  const closureHit = closureQ.data ?? null;
  const setBookingSurcharges = useSetBookingHotelSurcharges(tenantId);
  const setBookingGroomingAddons = useSetBookingGroomingAddons(tenantId);
  const addonsCatalogQ = useGroomingAddons(tenantId, { activeOnly: true });
  // Per-dog grooming plan: package, extras and grooming sheet for each dog.
  const [defaultPlan] = useState<DogPlan>(() => ({
    packageId: (!isEdit && prefill?.grooming?.package_id) || null,
    addons: [],
    instructions: {
      ...EMPTY_INSTRUCTIONS,
      selections: (!isEdit && prefill?.grooming_instructions?.selections) || {},
      medical_flags: (!isEdit && prefill?.grooming_instructions?.medical_flags) || [],
      notes: (!isEdit && prefill?.grooming_instructions?.notes) || "",
    },
  }));
  const [dogPlans, setDogPlans] = useState<Record<string, DogPlan>>({});
  const planFor = (key: string): DogPlan => dogPlans[key] ?? defaultPlan;
  function updatePlan(key: string, patch: Partial<DogPlan>) {
    setDogPlans((prev) => ({ ...prev, [key]: { ...(prev[key] ?? defaultPlan), ...patch } }));
  }
  const groomCardKeys: string[] =
    kind !== "grooming" ? [] : isEdit || petIds.length === 0 ? [EDIT_KEY] : petIds;
  const [timingMode, setTimingMode] = useState<TimingMode>("together");
  const [customTimes, setCustomTimes] = useState<Record<string, string>>({});
  const [groomRepeat, setGroomRepeat] = useState<GroomRepeatValue>(DEFAULT_GROOM_REPEAT);
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

  // Hotel departures are fixed windows: standard 09:00–09:30, or Stay & Play 16:00–16:30.
  // Keep end_at (duration) in step with the selected collection window.
  useEffect(() => {
    if (kind !== "hotel") return;
    const nights = Math.max(1, Math.floor(durationMins / 1440));
    const target = nights * 1440 + (isStayPlayWindow(accom.check_out_window) ? 7 * 60 : 0);
    if (target !== durationMins) setDurationMins(target);
  }, [kind, accom.check_out_window, durationMins]);

  async function persistAccommodation(bookingId: string) {
    return persistAccommodationForm(bookingId);
  }

  /** Per-pet accommodation choice → booking_pets, so each dog is priced in its own area. */
  async function persistPetAccommodations(bookingId: string) {
    if (kind !== "hotel") return;
    const fallback = hotel.accommodation_type ?? null;
    for (const petId of petIds) {
      const acc = petAcc[petId] || fallback;
      if (!acc) continue;
      const { error } = await supabase
        .from("booking_pets")
        .update({ accommodation_type: acc } as never)
        .eq("booking_id", bookingId)
        .eq("pet_id", petId);
      if (error) {
        toast.error("Booking saved, but per-pet accommodation did not save: " + error.message);
        return;
      }
    }
  }

  async function persistAccommodationForm(bookingId: string) {
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

  // Each dog's grooming sheet drives its own linked add-ons (e.g. tick & flea shampoo).
  useEffect(() => {
    const cat = instrCatalogQ.data;
    const addons = addonsCatalogQ.data;
    if (!cat || !addons) return;
    setDogPlans((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const [k, p] of Object.entries(prev)) {
        const a = applyInstructionAddons(p.addons, p.instructions.selections ?? {}, cat as any, addons as any);
        if (a !== p.addons) {
          next[k] = { ...p, addons: a };
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [dogPlans, instrCatalogQ.data, addonsCatalogQ.data]);

  // Load existing details when editing
  const detailsQ = useBookingServiceDetails(
    isEdit ? booking?.id ?? null : null,
    serviceType,
    tenantId,
  );
  useEffect(() => {
    if (!isEdit || !detailsQ.data) return;
    if (detailsQ.data.kind === "grooming" && detailsQ.data.data) {
      setGrooming(detailsQ.data.data);
      updatePlan(EDIT_KEY, { packageId: (detailsQ.data.data as any).package_id ?? null });
    }
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
    return null;
  }, [customerId, booking]);

  const resourceType = SERVICE_TYPES.find((s) => s.value === serviceType)?.resourceType;
  // Grooming: each dog's package + extras decide its appointment length.
  function planMinutes(key: string): number {
    const p = planFor(key);
    const pkg = (packagesQ.data ?? []).find((x) => x.id === p.packageId) ?? null;
    const addonMins = p.addons.reduce((sum, s) => {
      const a = (addonsCatalogQ.data ?? []).find((x) => x.id === s.addon_id);
      return sum + Number(a?.duration_minutes ?? 0) * (s.qty || 1);
    }, 0);
    const total = (pkg ? Number(pkg.expected_minutes) || 60 : 0) + addonMins;
    return total > 0 ? Math.max(15, total) : 0;
  }
  function planHasWork(key: string): boolean {
    const p = planFor(key);
    return Boolean(p.packageId) || p.addons.length > 0;
  }
  const allDogsReady = groomCardKeys.length > 0 && groomCardKeys.every(planHasWork);
  const firstCardMinutes = groomCardKeys[0] ? planMinutes(groomCardKeys[0]) : 0;
  useEffect(() => {
    if (kind !== "grooming" || firstCardMinutes === 0) return;
    setDurationMins((prev) => (prev === firstCardMinutes ? prev : firstCardMinutes));
  }, [kind, firstCardMinutes]);
  const filteredResources = (resourcesQ.data ?? []).filter(
    (r) => !resourceType || r.type === resourceType,
  );
  const confirm = useConfirm();

  // ---- Multi-dog grooming -------------------------------------------------
  // Each dog is its own appointment (own package, extras, sheet and groomer).
  const isMultiPetGrooming = kind === "grooming" && !isEdit && petIds.length > 1;
  // Customers can nominate a groomer they always want.
  const preferredGroomerQ = useQuery({
    queryKey: ["customer_preferred_groomer", customerId],
    enabled: Boolean(customerId && kind === "grooming"),
    queryFn: async (): Promise<string | null> => {
      const { data, error } = await supabase
        .from("customers")
        .select("preferred_groomer_resource_id")
        .eq("id", customerId as string)
        .maybeSingle();
      if (error) throw error;
      return ((data as any)?.preferred_groomer_resource_id ?? null) as string | null;
    },
  });
  const preferredGroomerId = preferredGroomerQ.data ?? null;
  // Default new in-house grooming bookings to the customer's preferred groomer.
  useEffect(() => {
    if (isEdit || serviceType !== "grooming_inhouse") return;
    if (!preferredGroomerId || resourceId) return;
    setResourceId(preferredGroomerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferredGroomerId, serviceType, isEdit]);
  const groomingDayKey = startAt ? startAt.slice(0, 10) : null;
  const groomingPoolKind = serviceType === "grooming_mobile" ? "mobile" : "inhouse";
  const groomingAvailQ = useGroomingDayAvailability(
    kind === "grooming" ? tenantId : null,
    groomingDayKey,
    groomingPoolKind,
  );
  // Which groomers are free for the currently chosen slot (drives the dropdown hints).
  const groomerFreeIds = useMemo(() => {
    if (kind !== "grooming" || !startAt) return new Set<string>();
    const start = new Date(startAt);
    const end = new Date(start.getTime() + (durationMins || 60) * 60000);
    const { free } = freeResourcesAt({
      resources: groomingAvailQ.data?.resources ?? [],
      busy: groomingAvailQ.data?.busy ?? [],
      start,
      end,
      excludeBookingIds: booking?.id ? [booking.id] : [],
    });
    return new Set(free.map((r) => r.id));
  }, [kind, startAt, durationMins, groomingAvailQ.data, booking?.id]);

  const petSlotRequests: PetSlotRequest[] = useMemo(
    () =>
      kind === "grooming"
        ? petIds.map((id) => ({ petId: id, durationMinutes: planMinutes(id) || 60 }))
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, petIds, dogPlans, packagesQ.data, addonsCatalogQ.data],
  );
  const totalMultiMinutes = petSlotRequests.reduce((s, p) => s + p.durationMinutes, 0);

  const groomingPlan = useMemo(() => {
    if (!isMultiPetGrooming || !startAt) return null;
    return planDogTimes({
      mode: timingMode,
      resources: groomingAvailQ.data?.resources ?? [],
      busy: groomingAvailQ.data?.busy ?? [],
      baseStart: new Date(startAt),
      pets: petSlotRequests,
      preferredResourceId: resourceId,
      customTimes,
    });
  }, [isMultiPetGrooming, startAt, groomingAvailQ.data, petSlotRequests, resourceId, timingMode, customTimes]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!customerId) return toast.error("Please select a customer");
    if (kind === "grooming") {
      const missing = groomCardKeys.find((k) => !planHasWork(k));
      if (missing !== undefined) {
        const name = petsQ.data?.find((p) => p.id === missing)?.name;
        return toast.error(
          name
            ? `Pick a package or treatment for ${name}`
            : "Please choose a grooming package or at least one individual treatment",
        );
      }
    }
    if (isMultiPetGrooming && startAt && !groomingPlan) {
      return toast.error("There isn't enough groomer time left that day for all the dogs. Pick an earlier slot.");
    }
    if (!startAt) {
      return toast.error(kind === "grooming" ? "Please pick a day and time slot" : "Please pick a start time");
    }
    if (!durationMins || durationMins <= 0) return toast.error("Please set a duration");
    const endComputed = new Date(new Date(startAt).getTime() + durationMins * 60000);
    if ((petsQ.data?.length ?? 0) > 0 && petIds.length === 0) {
      return toast.error("Select at least one pet for this booking");
    }

    if (kind === "hotel" && (accom.pickup_required || accom.dropoff_required) && !serviceAddressId) {
      return toast.error("Pick the collection / drop-off address — the van needs somewhere to go.");
    }

    if (needsVanAddress && !addressOverride) {

      if (!serviceAddressId) {
        return toast.error(
          isTransport
            ? "Pick the collection address — the driver needs somewhere to go."
            : "Pick the mobile grooming address — the van needs somewhere to go.",
        );
      }
      if (!vanAddressVerified) {
        return toast.error("Confirm this address on the map before saving the van booking.");
      }
      if (radiusBlocked) {
        return toast.error(
          `This address is outside the ${radiusQ.data?.radius_km} km travel radius. An admin override is needed.`,
        );
      }
    }

    if (transportRunFull) {
      if ((transportSettingsQ.data as any)?.overbooking_mode === "block") {
        return toast.error("Every van is already full on this day. Pick another day or raise the stop limit.");
      }
      const proceed = await confirm({
        title: "Vans are full on this day",
        description: "Every van has hit its planned stop limit. Save anyway?",
        confirmLabel: "Save anyway",
        tone: "destructive",
      });
      if (!proceed) return;
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

    const overrideNote =
      needsVanAddress && addressOverride && (!vanAddressVerified || radiusBlocked)
        ? radiusBlocked
          ? "[Address override] Saved outside the travel radius — confirm the trip with the driver."
          : "[Address override] Saved without a Google-verified address — confirm directions with the driver."
        : "";
    const notesInternalValue =
      [notesInternal.trim(), overrideNote].filter(Boolean).join("\n") || null;

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
            notes_internal: notesInternalValue,
            notes_customer: notesCustomer.trim() || null,
            service_address_id: serviceAddressId,
            closure_override: closureOverride,
          },
          pet_ids: petIds,
        });
        if (kind === "hotel") await persistPetAccommodations(booking.id);
        await saveDetails(booking.id);
        if (kind === "hotel") await persistSurcharges(booking.id);
        if (kind === "hotel") await persistAccommodation(booking.id);
        if (kind === "grooming") await persistGroomingAddons(booking.id);
        if (kind === "grooming") await persistInstructions(booking.id);
        toast.success("Booking updated");
        onSaved?.(booking.id);
      } else if (kind === "grooming") {
        // One appointment per dog, repeated on every chosen date.
        const baseStart = new Date(startAt);
        const autoResource =
          resourceId ??
          layoutGroomingAppointments({
            resources: groomingAvailQ.data?.resources ?? [],
            busy: groomingAvailQ.data?.busy ?? [],
            baseStart,
            pets: [{ petId: petIds[0] ?? "pet", durationMinutes: durationMins }],
            preferredResourceId: preferredGroomerId,
          })?.[0]?.resourceId ??
          null;
        const slots =
          isMultiPetGrooming && groomingPlan
            ? groomingPlan.map((s) => ({
                key: s.petId,
                petIds: [s.petId],
                start: s.start,
                end: s.end,
                resourceId: s.resourceId ?? resourceId,
              }))
            : [
                {
                  key: groomCardKeys[0] ?? EDIT_KEY,
                  petIds,
                  start: baseStart,
                  end: endComputed,
                  resourceId: autoResource,
                },
              ];
        const firstDay = startAt.slice(0, 10);
        const days = [firstDay, ...repeatDates(groomRepeat, firstDay)];
        let ruleId: string | null = null;
        if (days.length > 1) {
          const { data: ruleRow, error: ruleErr } = await supabase
            .from("recurring_rules")
            .insert({
              tenant_id: tenantId,
              frequency: "weekly",
              interval: groomRepeat.mode === "interval" ? groomRepeat.weeks : 1,
              days_of_week: null,
              end_date: days[days.length - 1],
              start_date: firstDay,
              active: true,
            } as any)
            .select("id")
            .single();
          if (ruleErr) throw ruleErr;
          ruleId = (ruleRow as any).id as string;
        }
        const newId = () =>
          typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : String(Date.now() + Math.random());
        const createdIds: string[] = [];
        for (const day of days) {
          const groupId = slots.length > 1 ? newId() : null;
          for (const s of slots) {
            const start = moveToDay(s.start, day);
            const mins = Math.round((s.end.getTime() - s.start.getTime()) / 60000);
            const end = new Date(start.getTime() + mins * 60000);
            const res = await create.mutateAsync({
              customer_id: customerId,
              pet_ids: s.petIds,
              service_type: serviceType,
              status,
              start_at: start.toISOString(),
              end_at: end.toISOString(),
              resource_id: s.resourceId,
              notes_internal: notesInternalValue,
              notes_customer: notesCustomer.trim() || null,
              service_address_id: serviceAddressId,
              closure_override: closureOverride,
              booking_group_id: groupId,
              recurring_rule_id: ruleId,
            });
            createdIds.push(res.id);
            const plan = planFor(s.key);
            await saveDetails(res.id, { packageId: plan.packageId, durationMinutes: mins });
            await persistGroomingAddons(res.id, plan.addons);
            await persistInstructions(res.id, plan.instructions);
          }
        }
        toast.success(
          createdIds.length === 1
            ? "Grooming appointment booked"
            : `Booked ${createdIds.length} grooming appointments${days.length > 1 ? ` over ${days.length} visits` : ""}`,
        );
        onSaved?.(createdIds[0]);
        onClose();
        return;
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
            notes_internal: notesInternalValue,
            notes_customer: notesCustomer.trim() || null,
            rule,
            service_address_id: serviceAddressId,
            closure_override: closureOverride,
          });
          for (const b of res.bookings) {
            if (kind === "hotel") await persistPetAccommodations(b.id);
            await saveDetails(b.id);
            if (kind === "hotel") await persistSurcharges(b.id);
            if (kind === "hotel") await persistAccommodation(b.id);
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
          notes_internal: notesInternalValue,
          notes_customer: notesCustomer.trim() || null,
          service_address_id: serviceAddressId,
          closure_override: closureOverride,
        });
        if (kind === "hotel") await persistPetAccommodations(res.id);
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

  async function saveDetails(
    bookingId: string,
    opts?: { packageId?: string | null; durationMinutes?: number },
  ) {
    if (kind === "grooming") {
      // Source service_package label from selected rate-card package so we
      // don't double-enter it on the form. Duration lives on the booking
      // itself but we still stamp duration_minutes on the details row.
      const packageId =
        opts?.packageId !== undefined ? opts.packageId : planFor(groomCardKeys[0] ?? EDIT_KEY).packageId;
      const pkg = (packagesQ.data ?? []).find((p) => p.id === packageId);
      await upsertDetails.mutateAsync({
        kind: "grooming",
        bookingId,
        data: {
          ...grooming,
          package_id: packageId ?? null,
          grooming_mode: serviceType === "grooming_mobile" ? "mobile" : "inhouse",
          service_package: pkg?.name ?? grooming.service_package ?? null,
          duration_minutes: opts?.durationMinutes ?? durationMins,
        },
      });
    } else if (kind === "hotel") {
      const petCare = accom.pets
        .map((p) => [p.name, p.feeding_instructions].filter(Boolean).join(": "))
        .filter((s) => s.includes(":"))
        .join("\n");
      const petMeds = accom.pets
        .map((p) => [p.name, p.medication_instructions].filter(Boolean).join(": "))
        .filter((s) => s.includes(":"))
        .join("\n");
      await upsertDetails.mutateAsync({
        kind: "hotel",
        bookingId,
        data: {
          ...hotel,
          check_in_window: accom.check_in_window || hotel.check_in_window || null,
          check_out_window: accom.check_out_window || hotel.check_out_window || null,
          feeding_instructions: petCare || hotel.feeding_instructions || null,
          medication_instructions: petMeds || hotel.medication_instructions || null,
          belongings_notes: accom.belongings_notes || hotel.belongings_notes || null,
          pickup_required: accom.pickup_required ?? hotel.pickup_required ?? false,
          dropoff_required: accom.dropoff_required ?? hotel.dropoff_required ?? false,
        },
      });
    } else if (kind === "transport") {
      await upsertDetails.mutateAsync({
        kind: "transport",
        bookingId,
        data: {
          ...transport,
          pickup_address_id: serviceAddressId,
          dropoff_address_id: serviceAddressId,
        },
      });
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

  async function persistGroomingAddons(bookingId: string, selection?: GroomingAddonSelection[]) {
    try {
      const catalog = addonsCatalogQ.data ?? [];
      const chosen = selection ?? planFor(groomCardKeys[0] ?? EDIT_KEY).addons;
      const rows = chosen.map((s) => {
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

  async function persistInstructions(bookingId: string, value?: GroomingInstructionsValue) {
    try {
      const v = value ?? planFor(groomCardKeys[0] ?? EDIT_KEY).instructions;
      await saveInstructions.mutateAsync({
        booking_id: bookingId,
        selections: v.selections,
        medical_flags: v.medical_flags,
        notes: v.notes?.trim() || null,
        told_office_to_call: v.told_office_to_call?.trim() || null,
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
          <CustomerCombobox
            tenantId={tenantId}
            value={customerId}
            initialCustomer={selectedCustomer as any}
            disabled={isEdit}
            inline={!customerId}
            autoFocus={!customerId && !isEdit}
            onChange={(id) => {
              setCustomerId(id);
              setPetIds([]);
              if (!isEdit) {
                // Start clean for the new customer — nothing carries over.
                setDogPlans({});
                setGrooming({});
                setCustomTimes({});
                setGroomRepeat(DEFAULT_GROOM_REPEAT);
                setRecurrence(DEFAULT_RECURRENCE);
                setNotesInternal("");
                setNotesCustomer("");
                setServiceAddressId(null);
                setAddressOverride(false);
                setResourceId(null);
              }
            }}
          />
        </div>

        {/* Pets */}
        {customerId && (
          <div>
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-sm font-medium">Pets</div>
              {canCreatePet && (
                <button
                  type="button"
                  onClick={() => setAddingPet(true)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-sk-coral-dark hover:underline"
                >
                  <Plus className="h-3.5 w-3.5" /> Add a pet
                </button>
              )}
            </div>
            {addingPet && customerId && (
              <PetFormModal
                tenantId={tenantId}
                customerId={customerId}
                onClose={() => setAddingPet(false)}
                onCreated={async (id) => {
                  setAddingPet(false);
                  await petsQ.refetch();
                  setPetIds((prev) => (prev.includes(id) ? prev : [...prev, id]));
                }}
              />
            )}
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
            {petIds.length > 0 && (
              <div className="mt-2">
                <div className="mb-2">
                  <PetsVaccinationGate
                    petIds={petIds}
                    serviceType={serviceType}
                    onDate={bookingDay || undefined}
                    mode="staff"
                  />
                </div>
                <HealthGateList
                  pets={petIds.map((id) => ({
                    id,
                    name: petsQ.data?.find((p) => p.id === id)?.name ?? null,
                  }))}
                  onDate={bookingDay || undefined}
                />
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
          {kind !== "grooming" && (
          <div>
            <div className="mb-1 text-sm font-medium">{isDaycare ? "Day" : "Start"}</div>
            {isDaycare ? (
              <>
                <input
                  type="date"
                  value={startAt ? startAt.slice(0, 10) : ""}
                  onChange={(e) => setStartAt(e.target.value ? `${e.target.value}T${DAYCARE_START_TIME}` : "")}
                  className={inputCls}
                />
                <div className="mt-1 text-[11px] text-muted-foreground">Daycare day runs 08:00 – 17:00.</div>
              </>
            ) : kind === "hotel" ? (
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
          )}
          {kind !== "grooming" && (
          <div>
            <div className="mb-1 text-sm font-medium">
              {kind === "hotel" ? "Nights" : isDaycare ? "How long?" : "Duration"}
            </div>
            {kind === "hotel" ? (
              <input
                type="number"
                min={1}
                step={1}
                value={Math.max(1, Math.floor(durationMins / 1440))}
                onChange={(e) =>
                  setDurationMins(
                    Math.max(1, Number(e.target.value)) * 1440 +
                      (isStayPlayWindow(accom.check_out_window) ? 7 * 60 : 0),
                  )
                }
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
            {startAt && !isDaycare && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                Ends {new Date(new Date(startAt).getTime() + durationMins * 60000).toLocaleString("en-ZA", {
                  weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
                })}
              </div>
            )}
          </div>
          )}
          <div className="sm:col-span-2">
            <div className="mb-1 text-sm font-medium">{RESOURCE_LABELS[serviceType]}</div>
            <select
              value={resourceId ?? ""}
              onChange={(e) => setResourceId(e.target.value || null)}
              className={inputCls}
            >
              <option value="">
                {kind === "grooming" ? "Auto-assign — next free groomer" : "— Unassigned —"}
              </option>
              {filteredResources.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                  {kind === "grooming" && startAt
                    ? groomerFreeIds.has(r.id)
                      ? " — free"
                      : " — busy"
                    : ""}
                </option>
              ))}
            </select>
            {kind === "grooming" && startAt && (groomingAvailQ.data?.resources?.length ?? 0) > 0 && (
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                {(groomingAvailQ.data?.resources ?? []).map((r) => (
                  <span key={r.id} className="inline-flex items-center gap-1">
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{
                        backgroundColor: groomerFreeIds.has(r.id)
                          ? (r.colour ?? "hsl(var(--muted-foreground))")
                          : "transparent",
                        border: `1px solid ${r.colour ?? "hsl(var(--border))"}`,
                      }}
                    />
                    {r.name} {groomerFreeIds.has(r.id) ? "free" : "busy"}
                  </span>
                ))}
              </div>
            )}
            {kind === "grooming" && preferredGroomerId && resourceId === preferredGroomerId && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                This customer's preferred groomer.
              </div>
            )}
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
          <GroomingFields
            value={grooming}
            onChange={(patch) => setGrooming((p) => ({ ...p, ...patch }))}
            mode={serviceType === "grooming_mobile" ? "mobile" : "inhouse"}
          />
        )}
        {kind === "grooming" && serviceType === "grooming_mobile" && (
          <div className="space-y-2">
            <AddressSelector
              customerId={customerId}
              tenantId={tenantId}
              value={serviceAddressId}
              onChange={setServiceAddressId}
              label="Mobile grooming address"
              mobileOnly
            />
            <ServiceRadiusNotice check={radiusQ.data} />
            {(!serviceAddressId || !vanAddressVerified || radiusBlocked) && (
              <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    {!serviceAddressId
                      ? "Pick the address the van must drive to. Use “New address” above if it isn't on file yet."
                      : !vanAddressVerified
                        ? "This address isn't pinned on the map yet. Use “Confirm this address” above so the van can navigate to it."
                        : "This address falls outside the travel radius."}
                    {canOverrideAddress && (
                      <label className="mt-2 flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={addressOverride}
                          onChange={(e) => setAddressOverride(e.target.checked)}
                        />
                        Save anyway (admin override)
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
        {kind === "grooming" && (
          <div className="space-y-3">
            <StepHeading
              n={1}
              title={groomCardKeys.length > 1 ? "What is each dog having?" : "What is the dog having?"}
              hint="Package, extras and grooming sheet — one card per dog."
            />
            {groomCardKeys.map((key, idx) => {
              const pet = key === EDIT_KEY ? null : petsQ.data?.find((p) => p.id === key) ?? null;
              const plan = planFor(key);
              const label =
                pet?.name ??
                (booking?.booking_pets.map((bp) => bp.pet?.name).filter(Boolean).join(", ") || "This booking");
              const petForSize: any = pet ?? petsQ.data?.find((p) => petIds.includes(p.id)) ?? null;
              const ready = planHasWork(key);
              const firstKey = groomCardKeys[0];
              const firstName = petsQ.data?.find((p) => p.id === firstKey)?.name ?? "the first dog";
              return (
                <div key={key} className="rounded-2xl border-2 border-sk-coral/30 bg-white p-3">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sk-coral text-sm font-bold text-white">
                        {idx + 1}
                      </span>
                      <div>
                        <div className="font-semibold">{label}</div>
                        <div className="text-xs text-muted-foreground">
                          {[petForSize?.breed, effectivePetSize(petForSize)].filter(Boolean).join(" · ")}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {idx > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            const src = planFor(firstKey);
                            updatePlan(key, { packageId: src.packageId, addons: [...src.addons] });
                          }}
                          className="rounded-lg border border-border px-2 py-1 text-xs font-medium hover:bg-muted"
                        >
                          Same as {firstName}
                        </button>
                      )}
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-xs font-medium " +
                          (ready ? "bg-sk-green-soft text-sk-green" : "bg-sk-orange-soft text-sk-orange")
                        }
                      >
                        {ready ? `${planMinutes(key)} min` : "Needs a package"}
                      </span>
                    </div>
                  </div>
                  <GroomingExtrasPanel
                    tenantId={tenantId}
                    bookingId={isEdit ? booking?.id ?? null : null}
                    species={petForSize?.species === "cat" ? "cat" : "dog"}
                    mode={serviceType === "grooming_mobile" ? "mobile" : "inhouse"}
                    packageId={plan.packageId}
                    onPackageChange={(id) => updatePlan(key, { packageId: id })}
                    addonSelection={plan.addons}
                    onAddonChange={(rows) => updatePlan(key, { addons: rows })}
                    pensionerDiscount={grooming.pensioner_discount ?? false}
                    mattedSurchargeZar={grooming.matted_surcharge_zar ?? null}
                    sedationSurchargeZar={grooming.sedation_surcharge_zar ?? null}
                    travelFee={grooming.travel_fee ?? null}
                    onTravelFeeChange={(v) => setGrooming((p) => ({ ...p, travel_fee: v }))}
                    petSize={effectivePetSize(petForSize)}
                  />
                  <details open={idx === 0} className="mt-3">
                    <summary className="cursor-pointer select-none rounded-lg bg-muted/40 px-3 py-2 text-sm font-medium">
                      Grooming sheet for {label}
                    </summary>
                    <div className="mt-2">
                      <BookingGroomingInstructionsPanel
                        tenantId={tenantId}
                        bookingId={isEdit ? booking?.id ?? null : null}
                        primaryPetId={key === EDIT_KEY ? petIds[0] ?? null : key}
                        value={plan.instructions}
                        onChange={(v) => updatePlan(key, { instructions: v })}
                      />
                    </div>
                  </details>
                </div>
              );
            })}

            <div className="pt-2">
              <StepHeading
                n={2}
                title="Pick a day and time"
                hint={
                  allDogsReady
                    ? isMultiPetGrooming
                      ? `${petIds.length} dogs · ${totalMultiMinutes} min of grooming`
                      : `${durationMins} min appointment`
                    : "Pick a package or treatment for every dog first"
                }
              />
            </div>
            {isMultiPetGrooming && (
              <div>
                <div className="mb-1.5 text-xs font-medium text-muted-foreground">How should the dogs be groomed?</div>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      ["together", "At the same time", "Different groomers"],
                      ["back_to_back", "One after the other", "Same groomer"],
                      ["custom", "I'll set each time", "e.g. 09:00 and 09:30"],
                    ] as const
                  ).map(([m, l, sub]) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setTimingMode(m)}
                      className={
                        "rounded-xl border px-3 py-2 text-left text-sm transition-colors " +
                        (timingMode === m
                          ? "border-sk-coral bg-sk-coral text-white"
                          : "border-border bg-white hover:bg-muted")
                      }
                    >
                      <div className="font-semibold">{l}</div>
                      <div className={"text-[11px] " + (timingMode === m ? "opacity-90" : "text-muted-foreground")}>
                        {sub}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {allDogsReady ? (
              <GroomingSlotPicker
                tenantId={tenantId}
                value={startAt || null}
                kind={groomingPoolKind}
                durationMinutes={
                  isMultiPetGrooming && timingMode === "back_to_back" ? totalMultiMinutes : durationMins
                }
                resourceId={resourceId}
                excludeBookingId={booking?.id ?? null}
                petSlots={isMultiPetGrooming && timingMode === "together" ? petSlotRequests : undefined}
                onChange={(startLocal) => {
                  if (startLocal) setStartAt(startLocal);
                }}
              />
            ) : (
              <div className="rounded-xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                Choose a package or treatment for every dog above and the free times will show here.
              </div>
            )}
            {isMultiPetGrooming && startAt && (
              <div className="rounded-xl border border-border bg-muted/30 p-3">
                <div className="text-sm font-semibold">Who goes when</div>
                {groomingPlan ? (
                  <>
                    <ul className="mt-2 space-y-2 text-sm">
                      {groomingPlan.map((s) => (
                        <li key={s.petId} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-medium">
                            {petsQ.data?.find((p) => p.id === s.petId)?.name ?? "Pet"}
                          </span>
                          <span className="flex items-center gap-2 text-muted-foreground">
                            {timingMode === "custom" ? (
                              <input
                                type="time"
                                step={900}
                                value={customTimes[s.petId] ?? clockOf(s.start)}
                                onChange={(e) =>
                                  setCustomTimes((prev) => ({ ...prev, [s.petId]: e.target.value }))
                                }
                                className="h-9 rounded-lg border border-border bg-white px-2 text-sm text-foreground"
                              />
                            ) : (
                              <span>{clockOf(s.start)}</span>
                            )}
                            <span>– {clockOf(s.end)}</span>
                            {s.resourceName ? <span>· {s.resourceName}</span> : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      One appointment per dog, all on a single invoice for this owner.
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-xs text-sk-orange">
                    Not enough groomer time left that day for all {petIds.length} dogs — pick an earlier slot.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
        {kind === "hotel" && (() => {
          const inBlock = movementBlockReason(startAt ? startAt.slice(0, 10) : null, "dropoff", holidaysQ.data);
          const outBlock = movementBlockReason(endAtLocal ? endAtLocal.slice(0, 10) : null, "collection", holidaysQ.data);
          if (!inBlock && !outBlock) return null;
          return (
            <div className="rounded-xl border border-sk-orange/40 bg-sk-orange-soft p-3 text-sm text-sk-orange">
              <div className="font-semibold">Gates are closed</div>
              {inBlock && <div>Check-in: {inBlock}</div>}
              {outBlock && <div>Collection: {outBlock}</div>}
              <p className="mt-1 text-xs">{MOVEMENT_RULES_NOTE}</p>
            </div>
          );
        })()}
        {kind === "hotel" && (
          <HotelExtrasPanel
            tenantId={tenantId}
            bookingId={booking?.id ?? null}
            species={serviceType === "hotel_cat" ? "cat" : "dog"}
            accommodationType={hotel.accommodation_type ?? ""}
            onAccommodationChange={(v) => setHotel((p) => ({ ...p, accommodation_type: v || null }))}
            petAccommodations={petAcc}
            onPetAccommodationChange={(petId, acc) => setPetAcc((prev) => ({ ...prev, [petId]: acc }))}
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
              customerId={customerId || null}
              tenantId={tenantId}
              addressId={serviceAddressId}
              onAddressChange={setServiceAddressId}
            />
            <PetSections form={accom} setForm={patchAccom} collapsible tenantId={tenantId} uploadedVia="admin" />
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
        {kind === "transport" && (
          <div className="space-y-2">
            <AddressSelector
              customerId={customerId}
              tenantId={tenantId}
              value={serviceAddressId}
              onChange={setServiceAddressId}
              label="Pickup / drop-off address"
            />
            <ServiceRadiusNotice check={radiusQ.data} />
            <VanLoadNotice
              rows={transportLoadQ.data}
              mode={(transportSettingsQ.data as any)?.overbooking_mode ?? "warn"}
              loading={transportLoadQ.isLoading}
            />
            {transportSettingsQ.data?.require_gate_code &&
              selectedVanAddress &&
              !((selectedVanAddress as any).access_notes ?? "").trim() && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    No gate code or access notes on this address. The customer must supply it by{" "}
                    {String(transportSettingsQ.data.gate_code_required_by_time ?? "07:00").slice(0, 5)} on the
                    collection day, or the trip may be charged as a failed collection.
                  </div>
                </div>
              )}
            {(!serviceAddressId || !vanAddressVerified || radiusBlocked) && (
              <div className="rounded-lg border-2 border-destructive bg-destructive/10 p-3 text-xs font-semibold text-destructive">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  <div>
                    {!serviceAddressId
                      ? "Pick the collection address. Use “New address” above if it isn't on file yet."
                      : !vanAddressVerified
                        ? "This address isn't pinned on the map yet. Use “Confirm this address” above so the driver can navigate to it."
                        : "This address falls outside the travel radius."}
                    {canOverrideAddress && (
                      <label className="mt-2 flex items-center gap-2 font-medium">
                        <input
                          type="checkbox"
                          checked={addressOverride}
                          onChange={(e) => setAddressOverride(e.target.checked)}
                        />
                        Save anyway (admin override)
                      </label>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {!isEdit && kind === "grooming" && (
          <div className="space-y-2">
            <StepHeading n={3} title="Coming back again?" hint="Optional — book the next visits now." />
            <GroomingRepeatFields
              value={groomRepeat}
              onChange={(patch) => setGroomRepeat((p) => ({ ...p, ...patch }))}
              firstDay={startAt ? startAt.slice(0, 10) : null}
              firstTime={startAt ? startAt.slice(11, 16) : null}
            />
          </div>
        )}
        {!isEdit && kind !== "grooming" && (
          <RecurrenceFields
            value={recurrence}
            onChange={(patch) => setRecurrence((p) => ({ ...p, ...patch }))}
            anchorDate={startAt ? new Date(startAt) : null}
          />
        )}

        <div>
          <div className="mb-1 text-sm font-medium">Internal notes</div>
          {closureHit && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm">
              <div className="flex items-start gap-2 font-medium text-amber-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{closureHit.name} — we are closed on this day.</span>
              </div>
              <label className="mt-2 flex items-center gap-2 text-amber-900">
                <input
                  type="checkbox"
                  checked={closureOverride}
                  onChange={(e) => setClosureOverride(e.target.checked)}
                  className="h-4 w-4 rounded border-amber-400"
                />
                Book anyway (override the closure)
              </label>
            </div>
          )}
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
            {savingAny
              ? "Saving…"
              : isEdit
                ? "Save changes"
                : kind === "grooming"
                  ? (() => {
                      const dogs = Math.max(1, isMultiPetGrooming ? petIds.length : 1);
                      const visits = 1 + repeatDates(groomRepeat, startAt ? startAt.slice(0, 10) : null).length;
                      const n = dogs * visits;
                      return n > 1 ? `Book ${n} appointments` : "Book appointment";
                    })()
                  : recurrence.enabled
                    ? "Create series"
                    : "Create booking"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

function StepHeading({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
        {n}
      </span>
      <div>
        <div className="text-base font-semibold">{title}</div>
        {hint && <div className="text-xs text-muted-foreground">{hint}</div>}
      </div>
    </div>
  );
}