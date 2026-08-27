import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Printer } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { useCustomerContactVisibility } from "@/lib/privacy/useCustomerContactVisibility";
import { isoDay } from "./queries";
import { DaycareRegisterSheet } from "./DaycareRegisterSheet";
import { GroomingRunSheet } from "./GroomingRunSheet";
import { HotelDailySheet } from "./HotelDailySheet";
import { VanRunSheet } from "./VanRunSheet";

type Dept = "daycare" | "grooming" | "hotel" | "vans";

const TABS: { key: Dept; label: string; landscape: boolean }[] = [
  { key: "daycare", label: "Daycare", landscape: false },
  { key: "grooming", label: "Grooming", landscape: false },
  { key: "hotel", label: "Hotel & cattery", landscape: true },
  { key: "vans", label: "Mobile vans", landscape: true },
];

function startOfDay(d: Date) { const c = new Date(d); c.setHours(0, 0, 0, 0); return c; }
function addDays(d: Date, n: number) { const c = new Date(d); c.setDate(c.getDate() + n); return c; }

export default function DailyListsPage() {
  const { tenant } = useCurrentTenant();
  const tenantId = tenant?.id ?? null;
  const [day, setDay] = useState<Date>(() => startOfDay(new Date()));
  const [dept, setDept] = useState<Dept>("daycare");
  const { canSeeCustomerPhone } = useCustomerContactVisibility();

  const dayLabel = day.toLocaleDateString("en-ZA", {
    weekday: "long", day: "2-digit", month: "long", year: "numeric",
  });
  const landscape = TABS.find((t) => t.key === dept)?.landscape ?? false;

  return (
    <div className={`flex-1 ${landscape ? "sk-print-landscape" : "sk-print-portrait"}`}>
      <div className="print:hidden">
        <AppHeader
          title="Daily lists"
          subtitle="Clean printouts for staff working off paper"
          tabs={TABS.map((t) => ({
            label: t.label,
            active: dept === t.key,
            onClick: () => setDept(t.key),
          }))}
          actions={
            <button
              onClick={() => window.print()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-sk-coral px-4 text-sm font-semibold text-white hover:bg-sk-coral-dark"
            >
              <Printer className="h-4 w-4" /> Print
            </button>
          }
        />
      </div>

      <div className="mx-auto w-full max-w-5xl p-4 sm:p-6 print:max-w-none print:p-0">
        <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
          <button
            onClick={() => setDay((d) => addDays(d, -1))}
            aria-label="Previous day"
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-white hover:bg-muted"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <input
            type="date"
            value={isoDay(day)}
            onChange={(e) => e.target.value && setDay(startOfDay(new Date(`${e.target.value}T00:00:00`)))}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm"
          />
          <button
            onClick={() => setDay((d) => addDays(d, 1))}
            aria-label="Next day"
            className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-white hover:bg-muted"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          <button
            onClick={() => setDay(startOfDay(new Date()))}
            className="h-10 rounded-xl border border-border bg-white px-3 text-sm font-medium hover:bg-muted"
          >
            Today
          </button>
        </div>

        {dept === "daycare" && (
          <DaycareRegisterSheet tenantId={tenantId} day={day} dayLabel={dayLabel} />
        )}
        {dept === "grooming" && (
          <GroomingRunSheet tenantId={tenantId} day={day} dayLabel={dayLabel} showPhone={canSeeCustomerPhone} />
        )}
        {dept === "hotel" && (
          <HotelDailySheet tenantId={tenantId} day={day} dayLabel={dayLabel} showPhone={canSeeCustomerPhone} />
        )}
        {dept === "vans" && (
          <VanRunSheet tenantId={tenantId} day={day} dayLabel={dayLabel} showPhone={canSeeCustomerPhone} />
        )}
      </div>
    </div>
  );
}
