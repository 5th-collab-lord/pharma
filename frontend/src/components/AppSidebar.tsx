import { Link, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  Package,
  Truck,
  AlertTriangle,
  BarChart3,
  ShoppingCart,
  ClipboardList,
  Pill,
  LogOut,
  Store,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function AppSidebar({ variant }: { variant: "admin" | "shop" }) {
  const { profile, role, signOut } = useAuth();
  const path = useRouterState({ select: (r) => r.location.pathname });

  const adminItems = [
    { to: "/admin", label: "Dashboard", Icon: LayoutDashboard },
    { to: "/admin/medicines", label: "Medicines", Icon: Pill },
    { to: "/admin/inventory", label: "Inventory", Icon: Package },
    { to: "/admin/dispatch", label: "Dispatch", Icon: Truck },
    { to: "/admin/alerts", label: "Alerts", Icon: AlertTriangle },
    { to: "/admin/analytics", label: "Analytics", Icon: BarChart3 },
    { to: "/admin/receipts", label: "Receipts", Icon: ClipboardList },
  ];
  const shopItems = [
    { to: "/shop", label: "Dashboard", Icon: LayoutDashboard },
    { to: "/shop/pos", label: "Point of Sale", Icon: ShoppingCart },
    { to: "/shop/inventory", label: "Inventory", Icon: Package },
    { to: "/shop/orders", label: "Orders", Icon: Truck },
    { to: "/shop/receipts", label: "Receipts", Icon: ClipboardList },
  ];
  const items = variant === "admin" ? adminItems : shopItems;

  return (
    <aside className="hidden md:flex flex-col w-64 shrink-0 bg-sidebar border-r border-sidebar-border min-h-screen">
      <Link to="/" className="px-6 py-6 flex items-center gap-3">
        <div className="h-10 w-10 rounded-2xl bg-gradient-primary grid place-items-center shadow-pink">
          <Pill className="h-5 w-5 text-white" />
        </div>
        <div>
          <div className="font-extrabold tracking-tight text-base leading-none text-primary">
            KK PHARMA
          </div>
          <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
            {variant === "admin" ? "Central Admin" : "Branch Console"}
          </div>
        </div>
      </Link>

      <nav className="px-3 flex-1 space-y-1">
        {items.map(({ to, label, Icon }) => {
          const active = path === to || (to !== `/${variant}` && path.startsWith(to));
          return (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-3 px-4 py-3 rounded-full text-sm font-semibold transition-all ${
                active
                  ? "bg-gradient-primary text-white shadow-pink"
                  : "text-foreground/70 hover:bg-sidebar-accent hover:text-primary"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-sidebar-border">
        <div className="flex items-center gap-3 mb-3">
          <div className="h-10 w-10 rounded-full bg-gradient-primary text-white grid place-items-center font-bold">
            {profile?.full_name?.[0]?.toUpperCase() ?? "?"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold truncate">{profile?.full_name ?? "User"}</div>
            <div className="text-[10px] uppercase tracking-widest text-muted-foreground flex items-center gap-1">
              {role === "admin" ? (
                <>
                  <LayoutDashboard className="h-3 w-3" /> System Admin
                </>
              ) : (
                <>
                  <Store className="h-3 w-3" /> Pharmacist
                </>
              )}
            </div>
          </div>
        </div>
        <Button
          onClick={signOut}
          variant="ghost"
          size="sm"
          className="w-full rounded-full justify-start gap-2 text-muted-foreground"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </Button>
      </div>
    </aside>
  );
}
