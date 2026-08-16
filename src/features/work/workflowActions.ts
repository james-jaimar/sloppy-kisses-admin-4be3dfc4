import type { BookingStatus, ServiceType } from "@/features/bookings/queries";

export type WorkActionTone = "primary" | "green" | "orange";

export interface WorkNextAction {
  label: string;
  successLabel: string;
  status: BookingStatus;
  tone: WorkActionTone;
}

const BEFORE_START: BookingStatus[] = ["draft", "requested", "approved", "confirmed", "needs_info"];

export function isGroomingService(serviceType: ServiceType): boolean {
  return serviceType === "grooming_inhouse" || serviceType === "grooming_mobile";
}

export function groomingNextAction(status: BookingStatus): WorkNextAction | null {
  if (BEFORE_START.includes(status)) {
    return { label: "Check in", successLabel: "Checked in", status: "checked_in", tone: "green" };
  }
  if (status === "checked_in") {
    return { label: "Start grooming", successLabel: "Grooming started", status: "grooming", tone: "primary" };
  }
  if (status === "grooming" || status === "in_progress") {
    return { label: "Ready for collection", successLabel: "Marked ready", status: "ready", tone: "orange" };
  }
  return null;
}

export function mobileGroomingStateLabel(status: BookingStatus): string {
  if (status === "checked_in") return "Checked in";
  if (status === "grooming" || status === "in_progress") return "Grooming in progress";
  if (status === "ready") return "Ready for collection";
  if (status === "checked_out" || status === "completed") return "Completed";
  return "Booked";
}