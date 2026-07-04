import { PawPrint } from "lucide-react";
import { cn } from "@/lib/utils";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-sk-coral text-white shadow-sm">
        <PawPrint className="h-5 w-5" />
      </span>
      {!compact && (
        <div className="leading-tight">
          <div className="text-[15px] font-semibold text-foreground">Sloppy Kisses</div>
          <div className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            Operations
          </div>
        </div>
      )}
    </div>
  );
}