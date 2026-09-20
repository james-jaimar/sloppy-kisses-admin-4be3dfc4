import { CUSTOMER_TYPE_META, customerTypeLabel } from "./customerTypes";

export function CustomerTypeChips({
  types,
  className = "",
  size = "sm",
}: {
  types: string[] | null | undefined;
  className?: string;
  size?: "xs" | "sm";
}) {
  const list = (types ?? []).filter(Boolean);
  if (list.length === 0) return null;
  const pad = size === "xs" ? "px-1.5 py-0 text-[10px]" : "px-2 py-0.5 text-[11px]";
  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {list.map((t) => (
        <span
          key={t}
          className={`inline-flex items-center rounded-full font-medium ${pad} ${
            CUSTOMER_TYPE_META[t]?.className ?? "bg-muted text-muted-foreground"
          }`}
        >
          {customerTypeLabel(t)}
        </span>
      ))}
    </div>
  );
}
