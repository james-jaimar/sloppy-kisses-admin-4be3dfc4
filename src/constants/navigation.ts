import {
  LayoutDashboard, Calendar, Users, PawPrint, Inbox, CalendarCheck, Dog, Hotel,
  Scissors, Truck, ArrowLeftRight, Receipt, ShoppingBag, BarChart3, Settings,
  FileText, CreditCard, User,
} from "lucide-react";

export const adminNav = [
  { to: "/admin/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin/calendar", label: "Calendar", icon: Calendar },
  { to: "/admin/customers", label: "Customers", icon: Users },
  { to: "/admin/pets", label: "Pets", icon: PawPrint },
  { to: "/admin/booking-requests", label: "Booking Requests", icon: Inbox, badge: 6 },
  { to: "/admin/bookings", label: "Bookings", icon: CalendarCheck },
  { to: "/admin/daycare", label: "Daycare", icon: Dog },
  { to: "/admin/hotel-cattery", label: "Hotel & Cattery", icon: Hotel },
  { to: "/admin/grooming", label: "Grooming", icon: Scissors },
  { to: "/admin/mobile-vans", label: "Mobile Vans", icon: Truck },
  { to: "/admin/pickup-dropoff", label: "Pick Up / Drop Off", icon: ArrowLeftRight },
  { to: "/admin/invoices", label: "Invoices & Payments", icon: Receipt },
  { to: "/admin/shop-stock", label: "Shop & Stock", icon: ShoppingBag },
  { to: "/admin/reports", label: "Reports", icon: BarChart3 },
  { to: "/admin/settings", label: "Settings", icon: Settings },
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