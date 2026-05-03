import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useSocket } from "@/hooks/useSocket";
import { AlertTriangle, Calendar, PackageX, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { fmtInr } from "@/lib/invoice";

export const Route = createFileRoute("/admin/alerts")({ component: Page });

const API_URL = "http://localhost:5000/api";

function Page() {
  const queryClient = useQueryClient();

  const { data: alerts = [], isLoading } = useQuery({
    queryKey: ["admin-alerts"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/alerts`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch alerts");
      return res.json();
    },
    refetchInterval: 10000,
  });

  const lowStock = alerts.filter(
    (a: any) => a.type === "WAREHOUSE_LOW_STOCK" || a.type === "SHOP_LOW_STOCK",
  );
  const expiring = alerts.filter(
    (a: any) => a.type === "WAREHOUSE_EXPIRING" || a.type === "EXPIRING_DISPATCH",
  );

  const LOW_STOCK_THRESHOLD = 50;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <AlertTriangle className="h-7 w-7 text-primary" /> Smart Alerts
        </h1>
        <p className="text-muted-foreground">Low-stock and expiring batches that need attention.</p>
      </header>

      <section className="rounded-2xl bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <PackageX className="h-5 w-5 text-primary" />
          <h2 className="font-bold">
            Low stock{" "}
            <span className="text-muted-foreground font-normal">
              (under {LOW_STOCK_THRESHOLD} units)
            </span>
          </h2>
          <span className="ml-auto text-xs bg-primary/10 text-primary px-3 py-1 rounded-full font-bold">
            {lowStock.length}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-4">Medicine</th>
              <th className="text-left p-4">Batch</th>
              <th className="text-right p-4">Stock</th>
              <th className="text-left p-4">Source</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="p-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : lowStock.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  All batches above the low-stock threshold. ✨
                </td>
              </tr>
            ) : (
              lowStock.map((r: any) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="p-4 font-semibold">{r.medicineName}</td>
                  <td className="p-4">
                    {r.batchNumber ?? (r.shopName ? `Shop: ${r.shopName}` : "—")}
                  </td>
                  <td
                    className={`p-4 text-right font-bold ${
                      r.severity === "critical" ? "text-destructive" : "text-primary"
                    }`}
                  >
                    {r.currentStock}
                  </td>
                  <td className="p-4 text-muted-foreground">
                    {r.type === "SHOP_LOW_STOCK" ? `Shop: ${r.shopName}` : "Warehouse"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </section>

      <section className="rounded-2xl bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center gap-3">
          <Calendar className="h-5 w-5 text-tertiary" />
          <h2 className="font-bold">
            Expiring soon{" "}
            <span className="text-muted-foreground font-normal">(within 30 days)</span>
          </h2>
          <span className="ml-auto text-xs bg-tertiary/10 text-tertiary px-3 py-1 rounded-full font-bold">
            {expiring.length}
          </span>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-4">Medicine</th>
              <th className="text-left p-4">Batch</th>
              <th className="text-left p-4">Expiry</th>
              <th className="text-left p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={4} className="p-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : expiring.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-muted-foreground">
                  No batches expiring within 30 days. ✨
                </td>
              </tr>
            ) : (
              expiring.map((r: any) => {
                const days = Math.ceil(
                  (new Date(r.expiryDate).getTime() - Date.now()) / 86_400_000,
                );
                return (
                  <tr key={r.id} className="border-t border-border">
                    <td className="p-4 font-semibold">{r.medicineName}</td>
                    <td className="p-4">{r.batchNumber}</td>
                    <td className="p-4">{new Date(r.expiryDate).toLocaleDateString()}</td>
                    <td className="p-4">
                      <div className="flex flex-col">
                        <span
                          className={`text-xs font-bold ${
                            days < 0
                              ? "text-destructive"
                              : days < 7
                                ? "text-primary"
                                : "text-tertiary"
                          }`}
                        >
                          {days < 0 ? `Expired ${-days}d ago` : `In ${days} days`}
                        </span>
                        {r.type === "EXPIRING_DISPATCH" && (
                          <span className="text-[10px] text-destructive uppercase tracking-tighter font-bold">
                            Dispatched to {r.shopName}
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
