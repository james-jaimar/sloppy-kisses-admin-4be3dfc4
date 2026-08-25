import { useState } from "react";
import { HotelQuoteDrawer } from "./HotelQuoteDrawer";
import { DaycareQuoteDrawer } from "./DaycareQuoteDrawer";

/**
 * Quote shell — owns which service is being quoted and renders that service's panel.
 * Hotel/cattery and daycare price very differently, so each has its own drawer.
 */
export function NewQuoteDrawer({
  tenantId,
  onClose,
  initialService = "hotel_dog",
  initialCustomerId,
}: {
  tenantId: string;
  onClose: () => void;
  initialService?: string;
  initialCustomerId?: string | null;
}) {
  const [service, setService] = useState(initialService);
  const Panel = service === "daycare" ? DaycareQuoteDrawer : HotelQuoteDrawer;
  return (
    <Panel
      tenantId={tenantId}
      onClose={onClose}
      service={service}
      onServiceChange={setService}
      initialCustomerId={initialCustomerId}
    />
  );
}
