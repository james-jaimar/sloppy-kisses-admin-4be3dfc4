import { Link } from "react-router-dom";
import { CalendarPlus } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentCustomer } from "../hooks";
import { DocumentsPanel } from "@/features/documents/DocumentsPanel";

export default function MyDocumentsPage() {
  const cust = useCurrentCustomer();
  return (
    <>
      <AppHeader
        title="Documents"
        subtitle="Vaccination certificates and other files"
        actions={
          <Link to="/customer/bookings/new" className="inline-flex items-center gap-2 rounded-lg bg-sk-coral px-4 py-2 text-sm font-semibold text-white hover:bg-sk-coral-dark">
            <CalendarPlus className="h-4 w-4" /> Book a service
          </Link>
        }
      />
      <div className="flex-1 space-y-4 p-6">
        {cust.data ? (
          <DocumentsPanel
            tenantId={cust.data.tenant_id}
            customerId={cust.data.id}
            uploadedVia="portal"
            title="Your documents"
          />
        ) : null}
      </div>
    </>
  );
}