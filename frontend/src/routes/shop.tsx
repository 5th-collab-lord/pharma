import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AppSidebar } from "@/components/AppSidebar";
import { RoleGuard } from "@/components/RoleGuard";

export const Route = createFileRoute("/shop")({ component: Layout });

function Layout() {
  return (
    <RoleGuard require="shop">
      <div className="min-h-screen flex bg-gradient-soft">
        <AppSidebar variant="shop" />
        <main className="flex-1 p-6 md:p-10 max-w-7xl">
          <Outlet />
        </main>
      </div>
    </RoleGuard>
  );
}
