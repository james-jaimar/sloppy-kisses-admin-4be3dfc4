import { AlertTriangle, Camera, CheckCircle2 } from "lucide-react";
import { useBookingPhotoGate, type PhotoGateMode } from "@/features/pets/photoGateQueries";
import { PhotoWaiverQuickAction } from "@/features/pets/PhotoWaiverQuickAction";
import { PetAttachments } from "@/features/uploads/PetAttachments";
import { useHotelWorkflowSettings } from "@/features/hotelCattery/queries";
import { useDaycareWorkflowSettings } from "@/features/daycare/queries";
import { useGroomingWorkflowSettings } from "@/features/grooming/workflowQueries";
import { useTransportWorkflowSettings } from "@/features/transport/queries";

type ServiceGroup = "hotel" | "daycare" | "grooming" | "transport";

export function serviceGroupOf(serviceType: string | null | undefined): ServiceGroup | null {
  switch (serviceType) {
    case "hotel_dog":
    case "hotel_cat":
      return "hotel";
    case "daycare":
    case "daycare_assessment":
      return "daycare";
    case "grooming_inhouse":
    case "grooming_mobile":
      return "grooming";
    case "pickup_dropoff":
      return "transport";
    default:
      return null;
  }
}

/** Reads the pet-photo requirement for a service from its workflow settings. */
export function usePhotoGateMode(tenantId: string | null | undefined, serviceType: string | null | undefined): PhotoGateMode {
  const group = serviceGroupOf(serviceType);
  const hotel = useHotelWorkflowSettings(group === "hotel" ? tenantId : null);
  const daycare = useDaycareWorkflowSettings(group === "daycare" ? tenantId : null);
  const grooming = useGroomingWorkflowSettings(group === "grooming" ? tenantId : null);
  const transport = useTransportWorkflowSettings(group === "transport" ? tenantId : null);
  const row =
    group === "hotel" ? hotel.data
    : group === "daycare" ? daycare.data
    : group === "grooming" ? grooming.data
    : group === "transport" ? transport.data
    : null;
  return ((row as any)?.photo_gate_mode as PhotoGateMode) ?? "off";
}

/**
 * Pet photo readiness for a booking — mirrors the vaccination gate.
 * Photos are how staff match the right dog to the right owner at check-in.
 */
export function PhotoGatePanel({
  tenantId, bookingId, serviceType,
}: { tenantId: string; bookingId: string; serviceType: string }) {
  const mode = usePhotoGateMode(tenantId, serviceType);
  const gateQ = useBookingPhotoGate(bookingId);

  if (mode === "off" || gateQ.isLoading) return null;
  const rows = gateQ.data ?? [];
  const missing = rows.filter((r) => r.status === "missing");
  const waived = rows.filter((r) => r.status === "waived");

  if (missing.length === 0) {
    if (rows.length === 0) return null;
    return (
      <div className="sk-card flex items-start gap-3 border-sk-green/40 bg-sk-green-soft/40 p-4 text-sm">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sk-green" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-sk-green">
            {waived.length ? "Pet photos OK (waiver in place)" : "Pet photos on file"}
          </div>
          <div className="text-xs text-muted-foreground">
            {waived.length
              ? `A waiver covers ${waived.map((r) => r.pet_name).join(", ")}.`
              : "Every pet on this booking has a photo we can match at check-in."}
          </div>
          {waived.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2 text-sk-green">
              {waived.map((r) => (
                <PhotoWaiverQuickAction key={r.pet_id} petId={r.pet_id} petName={r.pet_name} />
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  const tone = mode === "hard"
    ? "border-sk-coral bg-sk-coral-soft text-sk-coral-dark"
    : "border-sk-orange bg-sk-orange-soft text-sk-orange";
  const Icon = mode === "hard" ? Camera : AlertTriangle;

  return (
    <div className={"sk-card flex flex-col gap-3 border p-4 text-sm " + tone}>
      <div className="flex items-start gap-3">
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div>
          <div className="font-semibold">
            {mode === "hard" ? "Pet photo required" : "Pet photo missing"}
          </div>
          <div className="text-xs opacity-90">
            {mode === "hard"
              ? "Upload a photo (or log a waiver) before this booking can be confirmed."
              : "Not blocking, but staff can't match this pet at check-in without a photo."}
          </div>
        </div>
      </div>
      <ul className="space-y-3 rounded-lg bg-white/70 p-3 text-xs">
        {missing.map((r) => (
          <li key={r.pet_id} className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold">{r.pet_name}</span>
              <PhotoWaiverQuickAction petId={r.pet_id} petName={r.pet_name} />
            </div>
            <PetAttachments tenantId={tenantId} petId={r.pet_id} petName={r.pet_name} uploadedVia="admin" />
          </li>
        ))}
      </ul>
    </div>
  );
}