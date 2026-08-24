import { Link } from "react-router-dom";
import { Package, PackageSearch, ShoppingCart, ChevronRight, Barcode, Camera, ScanLine } from "lucide-react";
import { AppHeader } from "@/components/layout/AppHeader";

const SECTIONS = [
  { to: "/admin/pos", label: "Point of sale", description: "Full-screen tablet till with barcode scanning.", icon: Barcode },
  { to: "/admin/shop-stock/sale", label: "Quick sale", description: "Ring up an over-the-counter retail sale.", icon: ShoppingCart },
  { to: "/admin/shop-stock/products", label: "Products", description: "Manage your retail catalogue.", icon: Package },
  { to: "/admin/shop-stock/stock", label: "Stock levels", description: "Current on-hand and stock adjustments.", icon: PackageSearch },
  { to: "/admin/shop-stock/photos", label: "Photo studio", description: "Snap product photos on the tablet, straight onto the till.", icon: Camera },
  { to: "/admin/shop-stock/barcodes", label: "Unknown barcodes", description: "Match codes scanned at the till to a product.", icon: ScanLine },
];


export default function ShopIndexPage() {
  return (
    <>
      <AppHeader title="Shop & Stock" subtitle="Retail catalogue, stock and point-of-sale." />
      <div className="flex-1 p-6">
        <div className="grid gap-3 sm:grid-cols-2">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Link key={s.to} to={s.to} className="sk-card flex items-center gap-4 p-5 transition-colors hover:border-sk-coral">
                <div className="grid h-11 w-11 place-items-center rounded-xl bg-sk-coral-soft text-sk-coral-dark">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold">{s.label}</div>
                  <div className="text-xs text-muted-foreground">{s.description}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}