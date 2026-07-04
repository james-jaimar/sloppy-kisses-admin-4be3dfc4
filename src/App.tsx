import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { TenantProvider } from "@/lib/tenant/TenantContext";
import AdminLayout from "@/components/layout/AdminLayout";
import CustomerLayout from "@/components/layout/CustomerLayout";
import PublicFormLayout from "@/components/layout/PublicFormLayout";
import PlaceholderPage from "@/components/layout/PlaceholderPage";
import AdminDashboard from "@/features/dashboard/AdminDashboard";
import CalendarWeekView from "@/features/calendar/CalendarWeekView";
import CustomersPage from "@/features/customers/CustomersPage";
import BookingsPage from "@/features/bookings/BookingsPage";
import DaycareDailyList from "@/features/daycare/DaycareDailyList";
import BookingRequestQueue from "@/features/bookingRequests/BookingRequestQueue";
import CustomerDashboard from "@/features/customerPortal/CustomerDashboard";
import PublicIntakeForm from "@/features/forms/PublicIntakeForm";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />

              <Route element={<AdminLayout />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/calendar" element={<CalendarWeekView />} />
                <Route path="/admin/customers" element={<CustomersPage />} />
                <Route path="/admin/customers/:id" element={<PlaceholderPage title="Customer detail" />} />
                <Route path="/admin/pets" element={<PlaceholderPage title="Pets" />} />
                <Route path="/admin/pets/:id" element={<PlaceholderPage title="Pet detail" />} />
                <Route path="/admin/booking-requests" element={<BookingRequestQueue />} />
                <Route path="/admin/bookings" element={<BookingsPage />} />
                <Route path="/admin/bookings/:id" element={<PlaceholderPage title="Booking detail" />} />
                <Route path="/admin/daycare" element={<Navigate to="/admin/daycare/daily-list" replace />} />
                <Route path="/admin/daycare/daily-list" element={<DaycareDailyList />} />
                <Route path="/admin/daycare/plans" element={<PlaceholderPage title="Daycare plans" />} />
                <Route path="/admin/hotel-cattery" element={<PlaceholderPage title="Hotel & Cattery" />} />
                <Route path="/admin/grooming" element={<PlaceholderPage title="Grooming" />} />
                <Route path="/admin/mobile-vans" element={<PlaceholderPage title="Mobile vans" />} />
                <Route path="/admin/pickup-dropoff" element={<PlaceholderPage title="Pick Up / Drop Off" />} />
                <Route path="/admin/invoices" element={<PlaceholderPage title="Invoices & Payments" />} />
                <Route path="/admin/payments" element={<PlaceholderPage title="Payments" />} />
                <Route path="/admin/shop-stock" element={<PlaceholderPage title="Shop & Stock" />} />
                <Route path="/admin/reports" element={<PlaceholderPage title="Reports" />} />
                <Route path="/admin/users" element={<PlaceholderPage title="Users & roles" />} />
                <Route path="/admin/settings" element={<PlaceholderPage title="Settings" />} />
              </Route>

              <Route element={<CustomerLayout />}>
                <Route path="/customer/dashboard" element={<CustomerDashboard />} />
                <Route path="/customer/profile" element={<PlaceholderPage title="Profile" />} />
                <Route path="/customer/pets" element={<PlaceholderPage title="My pets" />} />
                <Route path="/customer/pets/:id" element={<PlaceholderPage title="Pet detail" />} />
                <Route path="/customer/bookings" element={<PlaceholderPage title="My bookings" />} />
                <Route path="/customer/bookings/:id" element={<PlaceholderPage title="Booking detail" />} />
                <Route path="/customer/documents" element={<PlaceholderPage title="Documents" />} />
                <Route path="/customer/invoices" element={<PlaceholderPage title="Invoices" />} />
                <Route path="/customer/payments" element={<PlaceholderPage title="Payments" />} />
              </Route>

              <Route element={<PublicFormLayout />}>
                <Route path="/forms/daycare-registration" element={<PublicIntakeForm title="Daycare registration" subtitle="Tell us about you and your dog to join Sloppy Kisses daycare." />} />
                <Route path="/forms/dog-accommodation" element={<PublicIntakeForm title="Dog hotel booking request" subtitle="Request an overnight stay for your dog." />} />
                <Route path="/forms/cattery" element={<PublicIntakeForm title="Cattery booking request" subtitle="Request a stay for your cat." />} />
                <Route path="/forms/grooming-request" element={<PublicIntakeForm title="In-house grooming request" />} />
                <Route path="/forms/mobile-grooming-request" element={<PublicIntakeForm title="Mobile grooming request" subtitle="We come to you in the Sloppy Kisses van." />} />
                <Route path="/forms/pickup-dropoff-request" element={<PublicIntakeForm title="Pick up / drop off request" />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
