import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Package, Store, Truck, AlertTriangle, Check, X, Loader2, ArrowRight } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useSocket } from "@/hooks/useSocket";

export const Route = createFileRoute("/admin/")({
  component: AdminDashboard,
});

const API_URL = "http://localhost:5000/api";

function AdminDashboard() {
  const queryClient = useQueryClient();
  const { onWarehouseUpdated, onDispatchUpdate, onShopStatusChanged, onMedicinesUpdated } =
    useSocket();

  // Live feed: instant invalidation on socket events
  useEffect(() => {
    // Warehouse stock changed (batch added, dispatch confirmed/rejected, price changed)
    const unsubWarehouse = onWarehouseUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
    });

    // Dispatch status changed (created, in_transit, confirmed, rejected)
    const unsubDispatch = onDispatchUpdate(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-recent-dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stock-summary"] });
    });

    // Shop approved or rejected
    const unsubShop = onShopStatusChanged(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
    });

    // Medicine added/updated/deleted
    const unsubMedicines = onMedicinesUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
    });

    return () => {
      unsubWarehouse?.();
      unsubDispatch?.();
      unsubShop?.();
      unsubMedicines?.();
    };
  }, [onWarehouseUpdated, onDispatchUpdate, onShopStatusChanged, onMedicinesUpdated, queryClient]);

  const {
    data: stats = {
      totalStock: 0,
      activeShops: 0,
      pendingDispatches: 0,
      alerts: 0,
      todaySales: 0,
      todayTransactions: 0,
    },
    isLoading: loadingStats,
  } = useQuery({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/reports/dashboard/admin`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: shops = [], isLoading: loadingShops } = useQuery({
    queryKey: ["admin-shops"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/shops`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch shops");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const { data: alerts = [], isLoading: loadingAlerts } = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/alerts`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    refetchInterval: 30000,
  });

  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/shops/${id}/approve`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to approve shop");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Shop approved successfully!");
      queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/shops/${id}/reject`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to reject shop");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Shop rejected and deleted.");
      queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const removeShopMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/admin/shops/${id}/remove`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to remove shop");
      return res.json();
    },
    onSuccess: () => {
      toast.success("Shop removed successfully.");
      queryClient.invalidateQueries({ queryKey: ["admin-shops"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  const cards = [
    { label: "Total Stock", value: stats.totalStock.toLocaleString(), Icon: Package, tone: "pink" },
    { label: "Active Shops", value: stats.activeShops, Icon: Store, tone: "purple" },
    { label: "Pending Dispatches", value: stats.pendingDispatches, Icon: Truck, tone: "blue" },
    {
      label: "Open Alerts",
      value: alerts.length || stats.alerts,
      Icon: AlertTriangle,
      tone: "pink",
    },
  ];

  const pendingShops = shops.filter((s: any) => !s.isActive);
  const approvedShops = shops.filter((s: any) => s.isActive);

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Dashboard Overview</h1>
        <p className="text-muted-foreground">Central warehouse at a glance.</p>
      </header>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map(({ label, value, Icon, tone }) => (
          <div
            key={label}
            className="rounded-2xl bg-card p-5 shadow-card flex items-start justify-between"
          >
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                {label}
              </div>
              <div className="text-4xl font-extrabold mt-2">{loadingStats ? "-" : value}</div>
            </div>
            <div
              className={`h-12 w-12 rounded-2xl grid place-items-center ${
                tone === "pink"
                  ? "bg-primary/10 text-primary"
                  : tone === "purple"
                    ? "bg-tertiary/10 text-tertiary"
                    : "bg-accent/10 text-accent"
              }`}
            >
              <Icon className="h-6 w-6" />
            </div>
          </div>
        ))}
      </div>

      {alerts.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight text-primary flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" /> System Alerts
          </h2>
          <div className="grid gap-4">
            {alerts.map((alert: any) => (
              <div
                key={alert.id}
                className={`rounded-2xl p-5 border flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm ${
                  alert.severity === "critical"
                    ? "bg-red-50/50 border-red-200"
                    : alert.type === "SHOP_LOW_STOCK"
                      ? "bg-orange-50/50 border-orange-200"
                      : "bg-yellow-50/50 border-yellow-200"
                }`}
              >
                <div>
                  <h3
                    className={`font-bold ${
                      alert.severity === "critical"
                        ? "text-red-900"
                        : alert.type === "SHOP_LOW_STOCK"
                          ? "text-orange-900"
                          : "text-yellow-900"
                    }`}
                  >
                    {alert.type === "SHOP_LOW_STOCK" &&
                      `Shop Critical Low Stock: ${alert.shopName}`}
                    {alert.type === "WAREHOUSE_LOW_STOCK" && `Warehouse Low Stock`}
                    {alert.type === "WAREHOUSE_EXPIRING" && `Warehouse Stock Expiring Soon`}
                  </h3>
                  <p
                    className={`text-sm mt-1 ${
                      alert.severity === "critical"
                        ? "text-red-800"
                        : alert.type === "SHOP_LOW_STOCK"
                          ? "text-orange-800"
                          : "text-yellow-800"
                    }`}
                  >
                    {alert.type === "SHOP_LOW_STOCK" &&
                      `${alert.medicineName} is critically low (${alert.currentStock} units remaining).`}
                    {alert.type === "WAREHOUSE_LOW_STOCK" &&
                      `${alert.medicineName} (Batch: ${alert.batchNumber}) is running low (${alert.currentStock} units remaining).`}
                    {alert.type === "WAREHOUSE_EXPIRING" &&
                      `${alert.medicineName} (Batch: ${alert.batchNumber}) expires on ${new Date(alert.expiryDate).toLocaleDateString()}.`}
                  </p>
                </div>
                {alert.type === "SHOP_LOW_STOCK" && (
                  <Button asChild className="bg-primary hover:bg-primary/90 shrink-0">
                    <Link to="/admin/dispatch">
                      Send Dispatch <ArrowRight className="h-4 w-4 ml-2" />
                    </Link>
                  </Button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Pending Approvals</h2>
        <div className="rounded-2xl bg-card shadow-card overflow-hidden">
          {loadingShops ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : pendingShops.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No pending shop approvals right now.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left p-4">Shop Name</th>
                  <th className="text-left p-4">Owner Name</th>
                  <th className="text-left p-4">Email</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pendingShops.map((shop: any) => (
                  <tr key={shop._id} className="border-t border-border">
                    <td className="p-4 font-semibold">{shop.name}</td>
                    <td className="p-4">{shop.ownerId?.name || "N/A"}</td>
                    <td className="p-4">{shop.ownerId?.email || "N/A"}</td>
                    <td className="p-4 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-green-600 border-green-200 hover:bg-green-50"
                        onClick={() => approveMutation.mutate(shop._id)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        <Check className="h-4 w-4 mr-1" /> Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => rejectMutation.mutate(shop._id)}
                        disabled={approveMutation.isPending || rejectMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" /> Reject
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <h2 className="text-xl font-bold tracking-tight">Approved Shops</h2>
        <div className="rounded-2xl bg-card shadow-card overflow-hidden">
          {loadingShops ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : approvedShops.length === 0 ? (
            <div className="p-12 text-center text-muted-foreground">
              No approved shops yet.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
                <tr>
                  <th className="text-left p-4">Shop Name</th>
                  <th className="text-left p-4">Owner Name</th>
                  <th className="text-left p-4">Email</th>
                  <th className="text-right p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {approvedShops.map((shop: any) => (
                  <tr key={shop._id} className="border-t border-border">
                    <td className="p-4 font-semibold">{shop.name}</td>
                    <td className="p-4">{shop.ownerId?.name || "N/A"}</td>
                    <td className="p-4">{shop.ownerId?.email || "N/A"}</td>
                    <td className="p-4 flex justify-end gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => {
                          if (confirm(`Remove approved shop "${shop.name}"?`)) {
                            removeShopMutation.mutate(shop._id);
                          }
                        }}
                        disabled={
                          removeShopMutation.isPending ||
                          approveMutation.isPending ||
                          rejectMutation.isPending
                        }
                      >
                        <X className="h-4 w-4 mr-1" /> Remove
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
