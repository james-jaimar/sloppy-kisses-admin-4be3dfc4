import { DocumentsPanel } from "@/features/documents/DocumentsPanel";

// Admin view of a customer's documents (folder view, all pets + customer-level).
export function DocumentsTab({ tenantId, customerId }: { tenantId: string; customerId: string }) {
  return (
    <DocumentsPanel
      tenantId={tenantId}
      customerId={customerId}
      uploadedVia="admin"
      title="Customer documents"
    />
  );
}