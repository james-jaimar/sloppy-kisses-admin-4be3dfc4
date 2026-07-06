import {
  FilePen, Inbox, HelpCircle, CheckCircle2, CalendarCheck, LogIn,
  Loader2, BellRing, LogOut, CheckCheck, XCircle, AlertOctagon,
} from "lucide-react";
import type { BookingStatus } from "./queries";

export interface BookingStatusMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes: solid pill (used in detail chip) */
  chip: string;
  /** Tailwind classes for the small icon-only badge on event cards */
  dot: string;
  spin?: boolean;
}

export const BOOKING_STATUS_META: Record<BookingStatus, BookingStatusMeta> = {
  draft:         { label: "Draft",       icon: FilePen,       chip: "bg-slate-100 text-slate-700 border-slate-300",         dot: "bg-slate-100 text-slate-600" },
  requested:     { label: "Requested",   icon: Inbox,         chip: "bg-sk-turquoise-soft text-sk-turquoise-dark border-sk-turquoise", dot: "bg-sk-turquoise-soft text-sk-turquoise-dark" },
  needs_info:    { label: "Needs info",  icon: HelpCircle,    chip: "bg-sk-orange-soft text-sk-orange border-sk-orange",     dot: "bg-sk-orange-soft text-sk-orange" },
  approved:      { label: "Approved",    icon: CheckCircle2,  chip: "bg-sk-green-soft text-sk-green border-sk-green",        dot: "bg-sk-green-soft text-sk-green" },
  confirmed:     { label: "Confirmed",   icon: CalendarCheck, chip: "bg-sk-green text-white border-sk-green",                 dot: "bg-sk-green text-white" },
  checked_in:    { label: "Checked in",  icon: LogIn,         chip: "bg-sk-turquoise text-white border-sk-turquoise",         dot: "bg-sk-turquoise text-white" },
  in_progress:   { label: "In progress", icon: Loader2,       chip: "bg-sk-coral text-white border-sk-coral",                 dot: "bg-sk-coral text-white", spin: true },
  ready:         { label: "Ready",       icon: BellRing,      chip: "bg-sk-orange text-white border-sk-orange",               dot: "bg-sk-orange text-white" },
  checked_out:   { label: "Checked out", icon: LogOut,        chip: "bg-slate-200 text-slate-700 border-slate-400",           dot: "bg-slate-200 text-slate-700" },
  completed:     { label: "Completed",   icon: CheckCheck,    chip: "bg-sk-green-dark text-white border-sk-green-dark",       dot: "bg-sk-green-dark text-white" },
  cancelled:     { label: "Cancelled",   icon: XCircle,       chip: "bg-muted text-muted-foreground border-border",           dot: "bg-muted text-muted-foreground" },
  no_show:       { label: "No show",     icon: AlertOctagon,  chip: "bg-destructive/10 text-destructive border-destructive/40", dot: "bg-destructive/10 text-destructive" },
};

export function BookingStatusChip({ status, className = "" }: { status: BookingStatus; className?: string }) {
  const m = BOOKING_STATUS_META[status];
  const Icon = m.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${m.chip} ${className}`}>
      <Icon className={`h-3 w-3 ${m.spin ? "animate-spin" : ""}`} />
      {m.label}
    </span>
  );
}

export function BookingStatusDot({ status, className = "" }: { status: BookingStatus; className?: string }) {
  const m = BOOKING_STATUS_META[status];
  const Icon = m.icon;
  return (
    <span
      title={m.label}
      className={`inline-grid h-4 w-4 place-items-center rounded-full ${m.dot} ${className}`}
    >
      <Icon className={`h-2.5 w-2.5 ${m.spin ? "animate-spin" : ""}`} />
    </span>
  );
}