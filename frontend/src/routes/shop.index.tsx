import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import { Package, ShoppingCart, Truck, AlertTriangle, Info, Check, X, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { fmtInr } from "@/lib/invoice";

export const Route = createFileRoute("/shop/")({ component: Page });

const API_URL = "http://localhost:5000/api";

function Page() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const { onDispatchUpdate, onInventoryUpdated } = useSocket();

  // Fetch dashboard stats
  const { data: dashboardStats } = useQuery({
    queryKey: ["shop-dashboard-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/reports/dashboard/shop`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Failed to fetch dashboard stats");
      return res.json();
    },
    refetchInterval: 10000 // Poll every 10 seconds as backup
  });

  // Fetch incoming dispatches
  const { data: dispatches = [] } = useQuery({
    queryKey: ["shop-incoming-dispatches"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/dispatch/shop/incoming`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Failed to fetch incoming dispatches");
      return res.json();
    },
    refetchInterval: 5000 // Reduced polling - socket handles real-time
  });

  // Listen for socket events
  useEffect(() => {
    const unsubDispatch = onDispatchUpdate((data) => {
      queryClient.invalidateQueries({ queryKey: ["shop-incoming-dispatches"] });
      toast.info(`Dispatch update: ${data.type}`);
    });

    const unsubInventory = onInventoryUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["shop-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["shop-dashboard-stats"] });
    });

    return () => {
      unsubDispatch?.();
      unsubInventory?.();
    };
  }, [onDispatchUpdate, onInventoryUpdated, queryClient]);

  const acceptMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/dispatch/shop/${id}/accept`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to accept dispatch");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || "Delivery confirmed! Warehouse stock deducted and added to your branch.");
      queryClient.invalidateQueries({ queryKey: ["shop-incoming-dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["shop-inventory"] });
      queryClient.invalidateQueries({ queryKey: ["shop-dashboard-stats"] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/dispatch/shop/${id}/reject`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to reject dispatch");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || "Delivery rejected. Warehouse stock was not affected.");
      queryClient.invalidateQueries({ queryKey: ["shop-incoming-dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["shop-dashboard-stats"] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  // Use dashboard stats from API
  const stats = {
    stock: dashboardStats?.totalStock || 0,
    sales: dashboardStats?.todaySales || 0,
    pending: dashboardStats?.incomingDispatches || dispatches.length || 0,
    low: dashboardStats?.lowStockCount || 0,
  };

  const cards = [
    { label: "Branch stock", value: stats.stock.toLocaleString(), Icon: Package, tone: "pink" as const },
    { label: "Today's sales", value: fmtInr(stats.sales), Icon: ShoppingCart, tone: "purple" as const },
    { label: "Incoming", value: stats.pending, Icon: Truck, tone: "blue" as const },
    { label: "Low stock items", value: stats.low, Icon: AlertTriangle, tone: "pink" as const },
  ];

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight">Welcome back{profile?.full_name ? `, ${profile.full_name.split(" ")[0]}` : ""} 👋</h1>
        <p className="text-muted-foreground">Here's how your branch is doing today.</p>
      </header>

      {/* Incoming Dispatches Notifications */}
      {dispatches.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-xl font-bold tracking-tight">Incoming Approvals</h2>
          <div className="grid gap-4">
            {dispatches.map((d: any) => (
              <div key={d._id} className="rounded-2xl bg-blue-50/50 border border-blue-100 p-5 flex flex-col md:flex-row md:items-start justify-between gap-4">
                <div className="flex items-start gap-4 flex-1">
                  <div className="h-10 w-10 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
                    <Info className="h-5 w-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-blue-900">Dispatch sent by {d.createdBy?.name || 'Admin'}</h3>
                    <p className="text-sm text-blue-800 mt-1">
                      {d.totalQuantity} medicines across {d.items?.length || 0} batches are incoming to your shop.
                    </p>
                    {d.notes && (
                      <p className="text-sm text-blue-700/80 mt-2 italic">Notes: {d.notes}</p>
                    )}
                    <div className="mt-3 space-y-1">
                      {d.items?.map((item: any, idx: number) => {
                        const days = Math.ceil(
                          (new Date(item.batchId?.expiryDate).getTime() - Date.now()) / 86_400_000,
                        );
                        const isExpiring = days <= 30;
                        return (
                          <div
                            key={idx}
                            className={`text-xs font-medium flex justify-between rounded px-2 py-1 ${
                              isExpiring
                                ? "bg-red-100/50 text-red-800 border border-red-200"
                                : "bg-blue-100/50 text-blue-800"
                            }`}
                          >
                            <span className="flex items-center gap-1.5">
                              {item.medicineId?.name} (Batch: {item.batchId?.batchNumber})
                              {isExpiring && (
                                <span className="flex items-center gap-0.5 text-[9px] font-bold uppercase text-red-600 animate-pulse">
                                  <AlertTriangle className="h-3 w-3" /> Near Expiry
                                </span>
                              )}
                            </span>
                            <span>Qty: {item.quantity}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
                <div className="flex flex-row md:flex-col gap-2 shrink-0">
                  <Button 
                    className="bg-green-600 hover:bg-green-700 text-white" 
                    onClick={() => acceptMutation.mutate(d._id)}
                    disabled={acceptMutation.isPending || rejectMutation.isPending}
                  >
                    {acceptMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Check className="h-4 w-4 mr-2" />}
                    Accept Delivery
                  </Button>
                  <Button 
                    variant="outline" 
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => rejectMutation.mutate(d._id)}
                    disabled={acceptMutation.isPending || rejectMutation.isPending}
                  >
                    {rejectMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <X className="h-4 w-4 mr-2" />}
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {cards.map(({ label, value, Icon, tone }) => (
          <div key={label} className="rounded-2xl bg-card p-5 shadow-card flex items-start justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">{label}</div>
              <div className="text-4xl font-extrabold mt-2">{value}</div>
            </div>
            <div className={`h-12 w-12 rounded-2xl grid place-items-center ${
              tone === "pink" ? "bg-primary/10 text-primary" : tone === "purple" ? "bg-tertiary/10 text-tertiary" : "bg-accent/10 text-accent"
            }`}><Icon className="h-6 w-6" /></div>
          </div>
        ))}
      </div>
      
      {!profile?.shop_id && (
        <div className="rounded-2xl bg-card p-8 shadow-card text-center mt-8">
          <p className="font-semibold text-foreground mb-2">No shop linked yet</p>
          <p className="text-sm text-muted-foreground">Ask your admin to assign you to a shop, or sign up again as a Shop / Branch user.</p>
        </div>
      )}
    </div>
  );
}
