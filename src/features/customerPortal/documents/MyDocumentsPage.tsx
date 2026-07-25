import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentCustomer } from "../hooks";
import { DocumentsPanel } from "@/features/documents/DocumentsPanel";

export default function MyDocumentsPage() {
  const cust = useCurrentCustomer();
  return (
    <>
      <AppHeader title="Documents" subtitle="Vaccination certificates and other files" />
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