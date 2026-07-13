import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import { AuthProvider } from "@/lib/auth/AuthContext";
import { TenantProvider } from "@/lib/tenant/TenantContext";
import { BrandingProvider } from "@/lib/branding/BrandingProvider";
import AdminLayout from "@/components/layout/AdminLayout";
import CustomerLayout from "@/components/layout/CustomerLayout";
import PublicFormLayout from "@/components/layout/PublicFormLayout";
import PlaceholderPage from "@/components/layout/PlaceholderPage";
import RequireAdmin from "@/components/auth/RequireAdmin";
import RequireCustomer from "@/components/auth/RequireCustomer";
import Login from "@/pages/Login";
import ForgotPassword from "@/pages/ForgotPassword";
import ResetPassword from "@/pages/ResetPassword";
import AuthAccept from "@/pages/AuthAccept";
import ChangePasswordPage from "@/features/settings/ChangePasswordPage";
import SettingsIndexPage from "@/features/settings/SettingsIndexPage";
import ResourcesPage from "@/features/settings/ResourcesPage";
import GroomingPackagesPage from "@/features/settings/GroomingPackagesPage";
import GroomingAddonsPage from "@/features/settings/GroomingAddonsPage";
import GroomingBoardPage from "@/features/grooming/GroomingBoardPage";
import HotelBoardPage from "@/features/hotelCattery/HotelBoardPage";
import HotelWorkflowPage from "@/features/settings/HotelWorkflowPage";
import MobileVansPage from "@/features/mobileVans/MobileVansPage";
import VanWorkflowPage from "@/features/settings/VanWorkflowPage";
import TransportBoardPage from "@/features/transport/TransportBoardPage";
import TransportWorkflowPage from "@/features/settings/TransportWorkflowPage";
import AdminDashboard from "@/features/dashboard/AdminDashboard";
import CalendarWeekView from "@/features/calendar/CalendarWeekView";
import CustomersPage from "@/features/customers/CustomersPage";
import CustomerDetailPage from "@/features/customers/CustomerDetailPage";
import PetsPage from "@/features/pets/PetsPage";
import PetDetailPage from "@/features/pets/PetDetailPage";
import BookingsPage from "@/features/bookings/BookingsPage";
import BookingDetailPage from "@/features/bookings/BookingDetailPage";
import DaycareBoardPage from "@/features/daycare/DaycareBoardPage";
import EnrolmentsPage from "@/features/daycare/EnrolmentsPage";
import AttendancePage from "@/features/daycare/AttendancePage";
import DaycarePlansPage from "@/features/settings/DaycarePlansPage";
import DaycareWorkflowPage from "@/features/settings/DaycareWorkflowPage";
import DaycareImportPage from "@/features/settings/DaycareImportPage";
import InvoicesListPage from "@/features/invoices/InvoicesListPage";
import InvoiceDetailPage from "@/features/invoices/InvoiceDetailPage";
import CreditNotesListPage from "@/features/creditNotes/CreditNotesListPage";
import CreditNoteDetailPage from "@/features/creditNotes/CreditNoteDetailPage";
import InvoicingSettingsPage from "@/features/settings/InvoicingSettingsPage";
import PaymentMethodsPage from "@/features/settings/PaymentMethodsPage";
import PaymentProvidersPage from "@/features/settings/PaymentProvidersPage";
import CommsInboxPage from "@/features/comms/CommsInboxPage";
import MessageTemplatesPage from "@/features/settings/MessageTemplatesPage";
import CommsSettingsPage from "@/features/settings/CommsSettingsPage";
import EmailServerSettingsPage from "@/features/settings/EmailServerSettingsPage";
import BrandingSettingsPage from "@/features/settings/BrandingSettingsPage";
import VaccinationRulesPage from "@/features/settings/VaccinationRulesPage";
import ShopIndexPage from "@/features/shop/ShopIndexPage";
import ProductsPage from "@/features/shop/ProductsPage";
import StockPage from "@/features/shop/StockPage";
import QuickSalePage from "@/features/shop/QuickSalePage";
import ProductCategoriesPage from "@/features/settings/ProductCategoriesPage";
import StockLocationsPage from "@/features/settings/StockLocationsPage";
import RetailSettingsPage from "@/features/settings/RetailSettingsPage";
import RolesPermissionsPage from "@/features/settings/RolesPermissionsPage";
import UsersPage from "@/features/users/UsersPage";
import { RequirePermission } from "@/components/auth/Can";
import RequirePlatform from "@/components/auth/RequirePlatform";
import PlatformLayout from "@/components/layout/PlatformLayout";
import PlatformOverviewPage from "@/features/platform/PlatformOverviewPage";
import PlatformTenantsPage from "@/features/platform/TenantsPage";
import PlatformUsersPage from "@/features/platform/PlatformUsersPage";
import FeatureFlagsPage from "@/features/platform/FeatureFlagsPage";
import AuditViewerPage from "@/features/platform/AuditViewerPage";
import ActivityPage from "@/features/platform/ActivityPage";
import SystemPage from "@/features/platform/SystemPage";
import BookingRequestQueue from "@/features/bookingRequests/BookingRequestQueue";
import CustomerDashboard from "@/features/customerPortal/CustomerDashboard";
import MyPetsPage from "@/features/customerPortal/pets/MyPetsPage";
import MyPetDetailPage from "@/features/customerPortal/pets/MyPetDetailPage";
import MyBookingsPage from "@/features/customerPortal/bookings/MyBookingsPage";
import MyBookingDetailPage from "@/features/customerPortal/bookings/MyBookingDetailPage";
import MyInvoicesPage from "@/features/customerPortal/invoices/MyInvoicesPage";
import MyInvoiceDetailPage from "@/features/customerPortal/invoices/MyInvoiceDetailPage";
import MyPaymentsPage from "@/features/customerPortal/payments/MyPaymentsPage";
import MyDocumentsPage from "@/features/customerPortal/documents/MyDocumentsPage";
import MyProfilePage from "@/features/customerPortal/profile/MyProfilePage";
import NewBookingRequestPage from "@/features/customerPortal/bookings/NewBookingRequestPage";
import PublicIntakeForm from "@/features/forms/PublicIntakeForm";
import PublicInvoicePage from "@/features/invoices/PublicInvoicePage";
import { PaySuccessPage, PayCancelPage } from "@/features/invoices/PayResultPages";
import ReportsIndexPage from "@/features/reports/ReportsIndexPage";
import AgingReportPage from "@/features/reports/AgingReportPage";
import CustomerStatementPage from "@/features/reports/CustomerStatementPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TenantProvider>
        <BrandingProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Navigate to="/admin/dashboard" replace />} />
              <Route path="/login" element={<Login />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/auth/accept" element={<AuthAccept />} />
              <Route path="/i/:token" element={<PublicInvoicePage />} />
              <Route path="/pay/success" element={<PaySuccessPage />} />
              <Route path="/pay/cancel" element={<PayCancelPage />} />

              <Route element={<RequireAdmin />}>
              <Route element={<AdminLayout />}>
                <Route path="/admin/dashboard" element={<AdminDashboard />} />
                <Route path="/admin/calendar" element={<CalendarWeekView />} />
                <Route path="/admin/customers" element={<CustomersPage />} />
                <Route path="/admin/customers/:id" element={<CustomerDetailPage />} />
                <Route path="/admin/customers/:id/statement" element={<CustomerStatementPage />} />
                <Route path="/admin/pets" element={<PetsPage />} />
                <Route path="/admin/pets/:id" element={<PetDetailPage />} />
                <Route path="/admin/booking-requests" element={<BookingRequestQueue />} />
                <Route path="/admin/bookings" element={<BookingsPage />} />
                <Route path="/admin/bookings/:id" element={<BookingDetailPage />} />
                <Route path="/admin/daycare" element={<DaycareBoardPage />} />
                <Route path="/admin/daycare/enrolments" element={<EnrolmentsPage />} />
                <Route path="/admin/daycare/attendance" element={<AttendancePage />} />
                <Route path="/admin/hotel-cattery" element={<HotelBoardPage />} />
                <Route path="/admin/grooming" element={<GroomingBoardPage />} />
                <Route path="/admin/mobile-vans" element={<MobileVansPage />} />
                <Route path="/admin/pickup-dropoff" element={<TransportBoardPage />} />
                <Route element={<RequirePermission code="invoices.view" />}>
                  <Route path="/admin/invoices" element={<InvoicesListPage />} />
                  <Route path="/admin/invoices/:id" element={<InvoiceDetailPage />} />
                  <Route path="/admin/payments" element={<InvoicesListPage />} />
                </Route>
                <Route element={<RequirePermission code="credit_notes.view" />}>
                  <Route path="/admin/credit-notes" element={<CreditNotesListPage />} />
                  <Route path="/admin/credit-notes/:id" element={<CreditNoteDetailPage />} />
                </Route>
                <Route path="/admin/comms" element={<CommsInboxPage />} />
                <Route path="/admin/shop-stock" element={<ShopIndexPage />} />
                <Route path="/admin/shop-stock/products" element={<ProductsPage />} />
                <Route path="/admin/shop-stock/stock" element={<StockPage />} />
                <Route path="/admin/shop-stock/sale" element={<QuickSalePage />} />
                <Route element={<RequirePermission code="reports.view" />}>
                  <Route path="/admin/reports" element={<ReportsIndexPage />} />
                  <Route path="/admin/reports/aging" element={<AgingReportPage />} />
                </Route>
                <Route element={<RequirePermission code="users.manage" />}>
                  <Route path="/admin/users" element={<UsersPage />} />
                  <Route path="/admin/settings/roles-permissions" element={<RolesPermissionsPage />} />
                </Route>
                <Route path="/admin/settings" element={<SettingsIndexPage />} />
                <Route path="/admin/settings/resources" element={<ResourcesPage />} />
                <Route path="/admin/settings/grooming-packages" element={<GroomingPackagesPage />} />
                <Route path="/admin/settings/grooming-addons" element={<GroomingAddonsPage />} />
                <Route path="/admin/settings/hotel-workflow" element={<HotelWorkflowPage />} />
                <Route path="/admin/settings/van-workflow" element={<VanWorkflowPage />} />
                <Route path="/admin/settings/transport-workflow" element={<TransportWorkflowPage />} />
                <Route path="/admin/settings/daycare-plans" element={<DaycarePlansPage />} />
                <Route path="/admin/settings/daycare-workflow" element={<DaycareWorkflowPage />} />
                <Route path="/admin/settings/daycare-import" element={<DaycareImportPage />} />
                <Route path="/admin/settings/invoicing" element={<InvoicingSettingsPage />} />
                <Route path="/admin/settings/payment-methods" element={<PaymentMethodsPage />} />
                <Route path="/admin/settings/payment-providers" element={<PaymentProvidersPage />} />
                <Route path="/admin/settings/message-templates" element={<MessageTemplatesPage />} />
                <Route path="/admin/settings/comms" element={<CommsSettingsPage />} />
                <Route path="/admin/settings/email" element={<EmailServerSettingsPage />} />
                <Route path="/admin/settings/branding" element={<BrandingSettingsPage />} />
                <Route path="/admin/settings/vaccination-rules" element={<VaccinationRulesPage />} />
                <Route path="/admin/settings/product-categories" element={<ProductCategoriesPage />} />
                <Route path="/admin/settings/stock-locations" element={<StockLocationsPage />} />
                <Route path="/admin/settings/retail" element={<RetailSettingsPage />} />
                <Route path="/admin/settings/password" element={<ChangePasswordPage />} />
              </Route>
              </Route>

              <Route element={<RequirePlatform />}>
                <Route element={<PlatformLayout />}>
                  <Route path="/platform" element={<PlatformOverviewPage />} />
                  <Route path="/platform/tenants" element={<PlatformTenantsPage />} />
                  <Route path="/platform/users" element={<PlatformUsersPage />} />
                  <Route path="/platform/flags" element={<FeatureFlagsPage />} />
                  <Route path="/platform/audit" element={<AuditViewerPage />} />
                  <Route path="/platform/activity" element={<ActivityPage />} />
                  <Route path="/platform/system" element={<SystemPage />} />
                </Route>
              </Route>

              <Route element={<RequireCustomer />}>
              <Route element={<CustomerLayout />}>
                <Route path="/customer/dashboard" element={<CustomerDashboard />} />
                <Route path="/customer/profile" element={<MyProfilePage />} />
                <Route path="/customer/profile/password" element={<ChangePasswordPage />} />
                <Route path="/customer/pets" element={<MyPetsPage />} />
                <Route path="/customer/pets/:id" element={<MyPetDetailPage />} />
                <Route path="/customer/bookings" element={<MyBookingsPage />} />
                <Route path="/customer/bookings/new" element={<NewBookingRequestPage />} />
                <Route path="/customer/bookings/:id" element={<MyBookingDetailPage />} />
                <Route path="/customer/documents" element={<MyDocumentsPage />} />
                <Route path="/customer/invoices" element={<MyInvoicesPage />} />
                <Route path="/customer/invoices/:id" element={<MyInvoiceDetailPage />} />
                <Route path="/customer/payments" element={<MyPaymentsPage />} />
              </Route>
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
        </BrandingProvider>
      </TenantProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
