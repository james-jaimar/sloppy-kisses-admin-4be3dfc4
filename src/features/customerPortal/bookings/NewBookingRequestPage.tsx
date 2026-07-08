import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useCurrentCustomer } from "../hooks";
import { NewBookingRequestModal } from "./NewBookingRequestModal";

export default function NewBookingRequestPage() {
  const cust = useCurrentCustomer();
  const navigate = useNavigate();
  if (cust.isLoading) return <div className="grid flex-1 place-items-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  if (!cust.data) return <div className="p-6 text-sm text-muted-foreground">No customer profile linked.</div>;
  return (
    <NewBookingRequestModal
      customerId={cust.data.id}
      tenantId={cust.data.tenant_id}
      onClose={() => navigate("/customer/bookings")}
    />
  );
}