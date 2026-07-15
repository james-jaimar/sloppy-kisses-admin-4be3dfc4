import {
  LayoutDashboard, Calendar, Users, PawPrint, Inbox, CalendarCheck, Dog, Hotel,
  Scissors, Truck, ArrowLeftRight, Receipt, ShoppingBag, BarChart3, Settings,
  FileText, CreditCard, User, MessageSquare, Building2, ShieldCheck, Flag,
  History, Activity, Database, FileMinus,
} from "lucide-react";

export const adminNav = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/calendar", label: "Calendar", icon: Calendar, code: "calendar.view" },
  { to: "/admin/customers", label: "Customers", icon: Users, code: "customers.view" },
  { to: "/admin/customer-signups", label: "Customer signups", icon: UserPlus, code: "customers.view" },
  { to: "/admin/pets", label: "Pets", icon: PawPrint, code: "pets.view" },
  { to: "/admin/booking-requests", label: "Booking Requests", icon: Inbox, badge: 6, code: "booking_requests.view" },
  { to: "/admin/bookings", label: "Bookings", icon: CalendarCheck, code: "bookings.view" },
  { to: "/admin/daycare", label: "Daycare", icon: Dog, code: "daycare.view" },
  { to: "/admin/hotel-cattery", label: "Hotel & Cattery", icon: Hotel, code: "hotel.view" },
  { to: "/admin/grooming", label: "Grooming", icon: Scissors, code: "grooming.view" },
  { to: "/admin/mobile-vans", label: "Mobile Vans", icon: Truck, code: "grooming.view" },
  { to: "/admin/pickup-dropoff", label: "Pick Up / Drop Off", icon: ArrowLeftRight, code: "transport.view" },
  { to: "/admin/invoices", label: "Invoices & Payments", icon: Receipt, code: "invoices.view" },
  { to: "/admin/credit-notes", label: "Credit notes", icon: FileMinus, code: "credit_notes.view" },
  { to: "/admin/comms", label: "Comms", icon: MessageSquare, code: "comms.view" },
  { to: "/admin/shop-stock", label: "Shop & Stock", icon: ShoppingBag, code: "products.view" },
  { to: "/admin/reports", label: "Reports", icon: BarChart3, code: "reports.view" },
  { to: "/admin/users", label: "Users & roles", icon: Users, code: "users.manage" },
  { to: "/admin/settings", label: "Settings", icon: Settings, code: "settings.manage" },
] as const;

export const customerNav = [
  { to: "/customer/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/customer/pets", label: "My Pets", icon: PawPrint },
  { to: "/customer/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/customer/documents", label: "Documents", icon: FileText },
  { to: "/customer/invoices", label: "Invoices", icon: Receipt },
  { to: "/customer/payments", label: "Payments", icon: CreditCard },
  { to: "/customer/profile", label: "Profile", icon: User },
] as const;

// Sys Dev / platform-owner-only navigation. Not shown to tenant users.
export const platformNav = [
  { to: "/platform", label: "Overview", icon: ShieldCheck },
  { to: "/platform/tenants", label: "Tenants", icon: Building2 },
  { to: "/platform/users", label: "Platform users", icon: Users },
  { to: "/platform/flags", label: "Feature flags", icon: Flag },
  { to: "/platform/audit", label: "Audit log", icon: History },
  { to: "/platform/activity", label: "Activity & events", icon: Activity },
  { to: "/platform/system", label: "System & secrets", icon: Database },
] as const;