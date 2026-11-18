import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { useCurrentUser } from "@/lib/tenant/TenantContext";
import { uniqueInvoices, type DeskInvoice } from "./invoiceSummary";

export async function fetchBookingInvoices(tenantId: string, ids: string[]): Promise<Record<string, DeskInvoice[]>> {
  if (!ids.length) return {};
  const [bookings, items] = await Promise.all([
    supabase.from("bookings").select("id, invoice_id").eq("tenant_id", tenantId).in("id", ids),
    supabase.from("invoice_items").select("booking_id, invoice_id").eq("tenant_id", tenantId).in("booking_id", ids),
  ]);
  if (bookings.error) throw bookings.error;
  if (items.error) throw items.error;
  if (bookings.data.length !== ids.length) throw new Error("Some bookings are unavailable");
  const links = [...bookings.data.map(b => ({ booking_id: b.id, invoice_id: b.invoice_id })), ...items.data];
  const invoiceIds = [...new Set(links.map(l => l.invoice_id).filter((id): id is string => Boolean(id)))];
  const map: Record<string, DeskInvoice[]> = Object.fromEntries(ids.map(id => [id, []]));
  if (!invoiceIds.length) return map;
  const [invoices, allItems, direct] = await Promise.all([
    supabase.from("invoices").select("id, invoice_number, customer_id, status, balance_due, total, due_date").eq("tenant_id", tenantId).in("id", invoiceIds),
    supabase.from("invoice_items").select("invoice_id, booking_id").eq("tenant_id", tenantId).in("invoice_id", invoiceIds),
    supabase.from("bookings").select("id, invoice_id").eq("tenant_id", tenantId).in("invoice_id", invoiceIds),
  ]);
  if (invoices.error) throw invoices.error;
  if (allItems.error) throw allItems.error;
  if (direct.error) throw direct.error;
  if (invoices.data.length !== invoiceIds.length) throw new Error("Some linked invoices are unavailable");
  const invoiceMap = new Map(invoices.data.map(inv => {
    const visits = new Set([...allItems.data.filter(i => i.invoice_id === inv.id).map(i => i.booking_id), ...direct.data.filter(b => b.invoice_id === inv.id).map(b => b.id)].filter(Boolean));
    return [inv.id, { ...inv, balance_due: Number(inv.balance_due), total: Number(inv.total), shared: visits.size > 1 }];
  }));
  for (const link of links) {
    const inv = link.invoice_id ? invoiceMap.get(link.invoice_id) : undefined;
    if (link.booking_id && inv && map[link.booking_id]) map[link.booking_id].push(inv);
  }
  return Object.fromEntries(Object.entries(map).map(([id, invs]) => [id, uniqueInvoices(invs)]));
}
export function useDeskBookingInvoices(tenantId: string | null | undefined, bookingIds: string[]) {
  const { hasPermission, profile } = useCurrentUser();
  const canView = profile?.user_type === "platform" || hasPermission("invoices.view");
  const ids = [...new Set(bookingIds)].sort();
  return useQuery({ queryKey: ["desk-booking-invoices", tenantId, ids], enabled: Boolean(tenantId && ids.length && canView), queryFn: () => fetchBookingInvoices(tenantId as string, ids), staleTime: 15_000, refetchInterval: 30_000 });
}
