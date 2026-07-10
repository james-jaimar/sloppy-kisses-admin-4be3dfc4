import { PawPrint } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useCurrentTenant } from "@/lib/tenant/TenantContext";
import { resolveLogoUrl } from "@/lib/branding/BrandingProvider";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  const { tenant } = useCurrentTenant();
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    resolveLogoUrl(tenant?.logo_url).then(setLogo);
  }, [tenant?.logo_url]);

  return (
    <div className={cn("flex items-center gap-2.5", compact && "justify-center", className)}>
      {logo ? (
        <img src={logo} alt={tenant?.name ?? "Logo"} className="h-9 w-9 rounded-xl object-contain bg-white" />
      ) : (
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-sk-coral text-white shadow-sm">
          <PawPrint className="h-5 w-5" />
        </span>
      )}
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-foreground">{tenant?.name ?? "Sloppy Kisses"}</div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Operations
          </div>
        </div>
      )}
    </div>
  );
}