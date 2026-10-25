import { ClipboardCheck, ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useHotelReviewCounts } from "./useHotelReviewCounts";

export function HotelReviewNotice({ tenantId }: { tenantId: string | null }) {
  const counts = useHotelReviewCounts(tenantId);
  if (counts.error) return <p role="alert" className="text-sm text-destructive">Hotel review counts could not be loaded.</p>;
  if (!counts.data?.total) return null;
  return (
    <section aria-label="Hotel attention needed" className="flex flex-wrap items-center justify-between gap-4 border-l-4 border-sk-coral bg-sk-coral-soft px-5 py-4">
      <div className="flex items-center gap-3">
        <ClipboardCheck className="h-6 w-6 shrink-0 text-sk-coral-dark" />
        <div>
          <h2 className="font-semibold text-foreground">Hotel · {counts.data.total} awaiting attention</h2>
          <p className="text-sm text-sk-coral-dark">{counts.data.review} stays / enquiries requiring review · {counts.data.quotes} open quotes</p>
        </div>
      </div>
      <Button variant="outline" asChild><Link to="/admin/hotel-cattery/pipeline">Review hotel pipeline<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
    </section>
  );
}