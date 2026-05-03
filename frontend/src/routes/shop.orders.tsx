import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Truck, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/shop/orders")({ component: Page });

const API_URL = "http://localhost:5000/api";

function Page() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // Fetch dispatches from Node backend
  const { data: rows = [] } = useQuery({
    queryKey: ["shop-dispatches"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/dispatch/shop/incoming`, {
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) throw new Error("Failed to fetch dispatches");
      return res.json();
    },
    refetchInterval: 5000
  });

  const confirmMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/dispatch/shop/${id}/accept`, {
        method: "PATCH",
        headers: { "Authorization": `Bearer ${localStorage.getItem("token")}` }
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to confirm dispatch");
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast.success(data.message || "Dispatch confirmed successfully");
      queryClient.invalidateQueries({ queryKey: ["shop-dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["shop-inventory"] });
    },
    onError: (err: any) => toast.error(err.message)
  });

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3"><Truck className="h-7 w-7 text-primary" /> Incoming Orders</h1>
        <p className="text-muted-foreground">Confirm dispatches when they arrive at your branch.</p>
      </header>
      <div className="space-y-3">
        {rows.map((d: any) => {
          const isOpen = open[d._id];
          const totalUnits = (d.items ?? []).reduce((s: number, i: any) => s + i.quantity, 0);
          const canConfirm = d.status === 'in_transit' || d.status === 'created';
          return (
            <div key={d._id} className="rounded-2xl bg-card shadow-card overflow-hidden">
              <div className="p-5 flex items-center gap-4">
                <button onClick={() => setOpen((p) => ({ ...p, [d._id]: !p[d._id] }))} className="h-9 w-9 grid place-items-center rounded-full bg-secondary hover:bg-secondary/80">
                  {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="font-bold">Dispatch · {new Date(d.createdAt).toLocaleString()}</div>
                  <div className="text-xs text-muted-foreground">{(d.items?.length ?? 0)} line(s) · {totalUnits} units {d.notes ? `· ${d.notes}` : ""}</div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${
                  d.status === "confirmed" ? "bg-accent/10 text-accent" : "bg-primary/10 text-primary"
                }`}>{d.status.replace("_", " ")}</span>
                {canConfirm && (
                  <Button onClick={() => confirmMutation.mutate(d._id)} disabled={confirmMutation.isPending} className="rounded-full shadow-pink">
                    <CheckCircle2 className="h-4 w-4 mr-2" /> {confirmMutation.isPending ? "Confirming…" : "Confirm delivery"}
                  </Button>
                )}
              </div>
              {isOpen && (
                <div className="border-t border-border bg-secondary/30">
                  <table className="w-full text-sm">
                    <thead className="text-xs uppercase tracking-widest text-muted-foreground">
                      <tr><th className="text-left p-3 px-6">Medicine</th><th className="text-left p-3">Batch</th><th className="text-left p-3">Expiry</th><th className="text-right p-3 px-6">Qty</th></tr>
                    </thead>
                    <tbody>
                      {(d.items ?? []).map((it: any) => (
                        <tr key={it.batchId?._id + it.medicineId?._id} className="border-t border-border/60">
                          <td className="p-3 px-6 font-semibold">{it.medicineId?.name}<div className="text-xs text-muted-foreground">{it.medicineId?.sku}</div></td>
                          <td className="p-3">{it.batchId?.batchNumber}</td>
                          <td className="p-3">{it.batchId?.expiryDate ? new Date(it.batchId.expiryDate).toLocaleDateString() : 'N/A'}</td>
                          <td className="p-3 px-6 text-right font-bold">{it.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
        {rows.length === 0 && <div className="rounded-2xl bg-card p-12 text-center text-muted-foreground shadow-card">No incoming orders yet.</div>}
      </div>
    </div>
  );
}
