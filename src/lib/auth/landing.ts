import type { WorkDept } from "@/features/work/queries";

/** Admin-area permissions that mean this user belongs at the counter, not in work mode. */
const ADMIN_CODES = [
  "settings.manage",
  "users.manage",
  "invoices.view",
  "invoices.create",
  "reports.view",
  "booking_requests.review",
  "bookings.create",
];

export interface LandingInput {
  userType: string | undefined;
  hasPermission: (code: string) => boolean;
  depts: WorkDept[];
}

const DEPT_ROUTE: Record<WorkDept, string> = {
  grooming_mobile: "/work/vans",
  transport: "/work/vans",
  daycare: "/work/daycare",
  hotel: "/work/hotel",
  grooming: "/work",
};

/** Where a signed-in user should land, based on user type and role permissions. */
export function landingFor({ userType, hasPermission, depts }: LandingInput): string {
  if (userType === "customer") return "/customer/dashboard";
  if (userType === "platform") return "/platform";

  const isAdminUser = ADMIN_CODES.some((c) => hasPermission(c));
  if (isAdminUser) return "/admin/home";

  // Shop staff live at the till.
  if (hasPermission("pos.sell") && !hasPermission("work.access")) return "/admin/pos";

  if (!hasPermission("work.access")) return "/admin/home";
  if (depts.length === 1) return DEPT_ROUTE[depts[0]];
  return "/work";

}

/** True when the user has any admin-area screens worth showing. */
export function hasAdminArea(hasPermission: (code: string) => boolean): boolean {
  return ADMIN_CODES.some((c) => hasPermission(c));
}
