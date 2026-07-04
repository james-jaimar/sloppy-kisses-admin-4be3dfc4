import type { UserRole } from "@/lib/auth/AuthContext";
import { useAuth } from "@/lib/auth/AuthContext";

export type Permission =
  | "customers.view" | "customers.create" | "customers.update"
  | "pets.view" | "pets.create" | "pets.update"
  | "booking_requests.view" | "booking_requests.review" | "booking_requests.approve"
  | "bookings.view" | "bookings.create" | "bookings.update"
  | "calendar.view" | "calendar.manage"
  | "daycare.view" | "daycare.manage"
  | "grooming.view" | "grooming.manage"
  | "hotel.view" | "hotel.manage"
  | "transport.view" | "transport.manage"
  | "invoices.view" | "invoices.create" | "invoices.mark_paid"
  | "payments.view"
  | "emails.send" | "emails.view_log"
  | "reports.view"
  | "users.manage"
  | "settings.manage";

const ROLE_MATRIX: Record<UserRole, "*" | Permission[]> = {
  platform_owner: "*",
  tenant_owner: "*",
  tenant_admin: "*",
  staff_frontdesk: [
    "customers.view", "customers.create", "customers.update",
    "pets.view", "pets.create", "pets.update",
    "booking_requests.view", "booking_requests.review",
    "bookings.view", "bookings.create", "bookings.update",
    "calendar.view", "calendar.manage",
    "invoices.view", "payments.view", "emails.send",
  ],
  staff_grooming: ["calendar.view", "grooming.view", "grooming.manage", "pets.view", "customers.view"],
  staff_daycare: ["calendar.view", "daycare.view", "daycare.manage", "pets.view", "customers.view"],
  staff_hotel: ["calendar.view", "hotel.view", "hotel.manage", "pets.view", "customers.view"],
  staff_driver: ["calendar.view", "transport.view", "transport.manage", "customers.view", "pets.view"],
  staff_accounts: ["invoices.view", "invoices.create", "invoices.mark_paid", "payments.view", "reports.view"],
  staff_read_only: ["customers.view", "pets.view", "bookings.view", "calendar.view", "reports.view"],
  customer: [],
};

export function hasPermission(roles: UserRole[] | undefined, permission: Permission): boolean {
  if (!roles?.length) return false;
  for (const role of roles) {
    const perms = ROLE_MATRIX[role];
    if (perms === "*") return true;
    if (perms?.includes(permission)) return true;
  }
  return false;
}

export function useHasPermission(permission: Permission): boolean {
  const { user } = useAuth();
  return hasPermission(user?.roles, permission);
}