import { Link } from "react-router-dom";
import { AppHeader } from "@/components/layout/AppHeader";
import { BarChart3, FileText } from "lucide-react";

const CARDS = [
  {
    to: "/admin/reports/aging",
    title: "Debtors aging",
    description: "Outstanding invoices bucketed by age (Current / 1–30 / 31–60 / 61–90 / 90+). Includes customer credit balances and net amount due.",
    icon: BarChart3,
  },
  {
    to: "/admin/customers",
    title: "Customer statements",
    description: "Open a customer's profile and click Statement to generate a printable account statement showing invoices, payments, credit notes and credit balance.",
    icon: FileText,
  },
];

export default function ReportsIndexPage() {
  return (
    <>
      <AppHeader title="Reports" subtitle="Debtors, statements and account activity" />
      <div className="grid gap-4 p-6 md:grid-cols-2">
        {CARDS.map((c) => (
          <Link key={c.to} to={c.to}
            className="sk-card block p-5 transition hover:shadow-md">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                <c.icon className="h-5 w-5" />
              </div>
              <div className="text-base font-semibold">{c.title}</div>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{c.description}</div>
          </Link>
        ))}
      </div>
    </>
  );
}