import { ChevronDown, ChevronUp, ChevronsUpDown } from "lucide-react";

interface Props<T extends string> {
  column: T;
  label: string;
  activeColumn: T;
  ascending: boolean;
  onChange: (column: T) => void;
  align?: "left" | "right";
  className?: string;
}

export function SortableHeader<T extends string>({
  column,
  label,
  activeColumn,
  ascending,
  onChange,
  align = "left",
  className = "",
}: Props<T>) {
  const active = column === activeColumn;
  const Icon = active ? (ascending ? ChevronUp : ChevronDown) : ChevronsUpDown;
  return (
    <th className={`px-5 py-3 ${className}`}>
      <button
        type="button"
        onClick={() => onChange(column)}
        className={`inline-flex items-center gap-1 select-none hover:text-foreground transition-colors ${
          align === "right" ? "flex-row-reverse" : ""
        } ${active ? "text-foreground" : ""}`}
      >
        <span>{label}</span>
        <Icon className={`h-3 w-3 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </th>
  );
}