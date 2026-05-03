import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, Plus, Trash2, Send, Package, Loader2, Warehouse, Store, Clock, Search, AlertTriangle } from "lucide-react";
import { useSocket } from "@/hooks/useSocket";

export const Route = createFileRoute("/admin/dispatch")({ component: Page });

const API_URL = "http://localhost:5000/api";

interface Line {
  batchId: string;
  quantity: number;
  /** Admin-mandated branch retail for this line (INR). */
  mandatedSellingPrice: number;
}

function Page() {
  const queryClient = useQueryClient();
  const { onWarehouseUpdated, onMedicinesUpdated, onDispatchUpdate } = useSocket();
  const [shopId, setShopId] = useState("");
  useEffect(() => {
    const unsubWarehouse = onWarehouseUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stock-summary"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    });
    const unsubMedicines = onMedicinesUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stock-summary"] });
    });
    const unsubDispatch = onDispatchUpdate(() => {
      queryClient.invalidateQueries({ queryKey: ["admin-recent-dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stock-summary"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    });
    return () => {
      unsubWarehouse?.();
      unsubMedicines?.();
      unsubDispatch?.();
    };
  }, [onWarehouseUpdated, onMedicinesUpdated, onDispatchUpdate, queryClient]);

  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [busy, setBusy] = useState(false);
  const [batchSearch, setBatchSearch] = useState("");
  const [recentSearch, setRecentSearch] = useState("");

  // Fetch Shops
  const { data: shops = [] } = useQuery({
    queryKey: ["admin-shops"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/admin/shops`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch shops");
      return res.json();
    },
  });

  const activeShops = shops.filter((s: any) => s.isActive);

  // Fetch Inventory (Batches)
  const { data: batches = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
  });

  const availableBatches = batches.filter((b: any) => b.stock > 0);

  const filteredPickBatches = useMemo(() => {
    const term = batchSearch.trim().toLowerCase();
    if (!term) return availableBatches;
    return availableBatches.filter((bo: any) => {
      const blob = [bo.batch_number, bo.medicines?.name, bo.medicines?.sku, bo.id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return blob.includes(term);
    });
  }, [availableBatches, batchSearch]);

  // Fetch Stock Distribution Summary
  const { data: stockSummary = [] } = useQuery({
    queryKey: ["dispatch-stock-summary"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/dispatch/admin/stock-summary`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stock summary");
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Fetch Recent Dispatches
  const { data: recentData = { dispatches: [] } } = useQuery({
    queryKey: ["admin-recent-dispatches"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/dispatch/admin/recent`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch recent dispatches");
      return res.json();
    },
    refetchInterval: 3000,
  });

  const recent = Array.isArray(recentData)
    ? recentData
    : (recentData?.dispatches ?? []);

  const filteredRecent = useMemo(() => {
    const list = Array.isArray(recent) ? recent : [];
    const term = recentSearch.trim().toLowerCase();
    if (!term) return list;
    return list.filter((d: any) => {
      const hay = [
        d.shopId?.name,
        d.notes,
        new Date(d.createdAt).toLocaleString(),
        d.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(term);
    });
  }, [recent, recentSearch]);

  const dispatchMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API_URL}/dispatch`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to create dispatch");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Dispatch sent successfully!");
      setLines([]);
      setNotes("");
      setShopId("");
      queryClient.invalidateQueries({ queryKey: ["admin-recent-dispatches"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["dispatch-stock-summary"] });
    },
    onError: (err: any) => {
      toast.error(err.message);
    },
    onSettled: () => setBusy(false),
  });

  const defaultMandatedForBatch = (batchId: string) => {
    const b = availableBatches.find((x: any) => x.id === batchId);
    return b ? Number(b.unit_price) || 0 : 0;
  };

  const addLine = () =>
    setLines((p) => [...p, { batchId: "", quantity: 1, mandatedSellingPrice: 0 }]);
  const removeLine = (i: number) => setLines((p) => p.filter((_, idx) => idx !== i));
  const updateLine = (i: number, patch: Partial<Line>) =>
    setLines((p) => p.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));

  const totalUnits = useMemo(
    () => lines.reduce((s, l) => s + (Number(l.quantity) || 0), 0),
    [lines],
  );

  const submit = async () => {
    if (!shopId) return toast.error("Choose a destination shop");
    if (lines.length === 0) return toast.error("Add at least one batch line");

    for (const l of lines) {
      if (!l.batchId) return toast.error("Pick a batch on every line");
      const b = availableBatches.find((x: any) => x.id === l.batchId);
      if (!b) return toast.error("Selected batch not found");

      const days = Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86_400_000);
      if (days <= 30) {
        return toast.error(`Cannot dispatch ${b.medicines?.name}: expiry medicine not go to dispatch`);
      }

      if (l.quantity <= 0) return toast.error("Quantity must be > 0");
      if (l.quantity > b.stock)
        return toast.error(`Only ${b.stock} units available in batch ${b.batch_number}`);
      const m = Number(l.mandatedSellingPrice);
      if (!Number.isFinite(m) || m <= 0)
        return toast.error("Set a positive mandated retail (₹) on every line");
    }

    setBusy(true);
    dispatchMutation.mutate({
      shopId,
      notes,
      lines: lines.map((l) => ({
        batchId: l.batchId,
        quantity: l.quantity,
        mandatedSellingPrice: Number(l.mandatedSellingPrice),
      })),
    });
  };

  // Summary totals across all medicines
  const totalWarehouse = stockSummary.reduce(
    (s: number, m: any) => s + (m.availableWarehouseStock ?? m.warehouseStock),
    0,
  );
  const totalDispatched = stockSummary.reduce((s: number, m: any) => s + m.dispatchedStock, 0);
  const totalPending = stockSummary.reduce((s: number, m: any) => s + m.pendingStock, 0);
  const grandTotal = totalWarehouse + totalDispatched + totalPending;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <Truck className="h-7 w-7 text-primary" /> Dispatch Builder
        </h1>
        <p className="text-muted-foreground">
          Pick batches from the warehouse and send them to a shop.
        </p>
      </header>

      {/* ── Stock Distribution Summary ── */}
      {stockSummary.length > 0 && (
        <section className="space-y-4">
          {/* Top-level totals */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-card shadow-card p-5 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-primary/10 text-primary grid place-items-center shrink-0">
                <Warehouse className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Warehouse Stock
                </div>
                <div className="text-3xl font-extrabold mt-1">
                  {totalWarehouse.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">units remaining</div>
              </div>
            </div>
            <div className="rounded-2xl bg-card shadow-card p-5 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-accent/10 text-accent grid place-items-center shrink-0">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  Dispatched to Shops
                </div>
                <div className="text-3xl font-extrabold mt-1">
                  {totalDispatched.toLocaleString()}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">units confirmed received</div>
              </div>
            </div>
            <div className="rounded-2xl bg-card shadow-card p-5 flex items-center gap-4">
              <div className="h-11 w-11 rounded-xl bg-tertiary/10 text-tertiary grid place-items-center shrink-0">
                <Clock className="h-5 w-5" />
              </div>
              <div>
                <div className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                  In Transit / Pending
                </div>
                <div className="text-3xl font-extrabold mt-1">{totalPending.toLocaleString()}</div>
                <div className="text-xs text-muted-foreground mt-0.5">units not yet confirmed</div>
              </div>
            </div>
          </div>

          {/* Per-medicine breakdown */}
          <div className="rounded-2xl bg-card shadow-card overflow-hidden">
            <div className="px-6 py-4 border-b border-border flex items-center gap-3">
              <Package className="h-5 w-5 text-primary" />
              <h2 className="font-bold">Stock Distribution per Medicine</h2>
              <span className="ml-auto text-xs text-muted-foreground">
                Warehouse · Dispatched · In-Transit
              </span>
            </div>
            <div className="divide-y divide-border">
              {(stockSummary as any[]).map((m: any) => {
                const availableWarehouse = m.availableWarehouseStock ?? m.warehouseStock;
                const rowTotal = availableWarehouse + m.dispatchedStock + m.pendingStock;
                const warehousePct =
                  grandTotal > 0
                    ? (availableWarehouse / (rowTotal || 1)) * 100
                    : 0;
                const dispatchedPct =
                  grandTotal > 0
                    ? (m.dispatchedStock / (rowTotal || 1)) * 100
                    : 0;
                const pendingPct =
                  grandTotal > 0
                    ? (m.pendingStock / (rowTotal || 1)) * 100
                    : 0;

                return (
                  <div key={m.medicineId} className="px-6 py-4">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <span className="font-semibold text-sm">{m.name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{m.category}</span>
                      </div>
                      <div className="flex items-center gap-4 text-xs font-medium">
                        <span className="flex items-center gap-1 text-primary">
                          <Warehouse className="h-3 w-3" />
                          {availableWarehouse}
                        </span>
                        <span className="flex items-center gap-1 text-accent">
                          <Store className="h-3 w-3" />
                          {m.dispatchedStock}
                        </span>
                        {m.pendingStock > 0 && (
                          <span className="flex items-center gap-1 text-tertiary">
                            <Clock className="h-3 w-3" />
                            {m.pendingStock}
                          </span>
                        )}
                        <span className="text-muted-foreground">/ {rowTotal} total</span>
                      </div>
                    </div>
                    {/* Stacked progress bar */}
                    <div className="h-2 rounded-full bg-secondary overflow-hidden flex">
                      {warehousePct > 0 && (
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: `${warehousePct}%` }}
                        />
                      )}
                      {dispatchedPct > 0 && (
                        <div
                          className="h-full bg-accent transition-all"
                          style={{ width: `${dispatchedPct}%` }}
                        />
                      )}
                      {pendingPct > 0 && (
                        <div
                          className="h-full bg-tertiary transition-all"
                          style={{ width: `${pendingPct}%` }}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {/* Legend */}
            <div className="px-6 py-3 border-t border-border bg-secondary/30 flex items-center gap-6 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-primary inline-block" /> Warehouse
                (remaining)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-accent inline-block" /> Dispatched to
                shops (confirmed)
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-tertiary inline-block" /> In transit /
                pending
              </span>
            </div>
          </div>
        </section>
      )}

      {/* ── Dispatch Builder Form ── */}
      <div className="rounded-2xl bg-card shadow-card p-6 space-y-5">
        <div className="grid md:grid-cols-2 gap-5">
          <div>
            <Label className="mb-2 block">Destination shop</Label>
            <select
              value={shopId}
              onChange={(e) => setShopId(e.target.value)}
              className="w-full h-11 rounded-full border border-input bg-background px-4 text-sm"
            >
              <option value="">Select shop…</option>
              {activeShops.map((s: any) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label className="mb-2 block">Notes (optional)</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Weekly restock"
              className="rounded-full h-11"
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={batchSearch}
                onChange={(e) => setBatchSearch(e.target.value)}
                placeholder="Search warehouse batches by medicine, SKU, batch #…"
                className="pl-10 rounded-full h-10"
              />
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addLine}
              className="rounded-full shrink-0"
            >
              <Plus className="h-4 w-4 mr-1" /> Add line
            </Button>
          </div>
          <div className="flex items-center justify-between">
            <Label>Batches · mandated retail guides the branch; alerts fire if POS sells differently</Label>
          </div>
          {lines.length === 0 && (
            <div className="rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              No batches added yet.
            </div>
          )}
          {lines.map((line, i) => {
            const b = availableBatches.find((x: any) => x.id === line.batchId);
            return (
              <div
                key={i}
                className="grid grid-cols-12 gap-3 items-end bg-secondary/40 p-3 rounded-2xl"
              >
                <div className="col-span-12 sm:col-span-4">
                  <select
                    value={line.batchId}
                    onChange={(e) => {
                      const bid = e.target.value;
                      updateLine(i, {
                        batchId: bid,
                        mandatedSellingPrice: defaultMandatedForBatch(bid),
                      });
                    }}
                    className="w-full h-10 rounded-full border border-input bg-background px-4 text-sm"
                  >
                    <option value="">Pick a batch…</option>
                    {filteredPickBatches.map((bo: any) => {
                      const days = Math.ceil(
                        (new Date(bo.expiry_date).getTime() - Date.now()) / 86_400_000,
                      );
                      const isExpiring = days <= 30;
                      return (
                        <option key={bo.id} value={bo.id}>
                          {bo.medicines?.name} · {bo.batch_number} · ₹{bo.unit_price} · stock{" "}
                          {bo.stock} · exp {bo.expiry_date}
                          {isExpiring ? " (EXPIRING SOON!)" : ""}
                        </option>
                      );
                    })}
                  </select>
                  {b && (
                    <div className="mt-1.5 px-3">
                      {Math.ceil((new Date(b.expiry_date).getTime() - Date.now()) / 86_400_000) <=
                       30 ? (
                         <div className="flex items-center gap-1.5 text-primary animate-pulse">
                           <AlertTriangle className="h-3 w-3" />
                           <span className="text-[10px] font-bold uppercase tracking-tight">
                             expiry medicine not go to dispatch
                           </span>
                         </div>
                       ) : (
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          <span className="text-[10px]">
                            Expires {new Date(b.expiry_date).toLocaleDateString()}
                          </span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="col-span-6 sm:col-span-2">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Units
                  </Label>
                  <Input
                    type="number"
                    min={1}
                    max={b?.stock ?? undefined}
                    value={line.quantity}
                    onChange={(e) => updateLine(i, { quantity: Number(e.target.value) })}
                    className="rounded-full h-10 text-right mt-1"
                  />
                </div>
                <div className="col-span-6 sm:col-span-4">
                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">
                    Mandated retail (₹ / unit)
                  </Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={line.mandatedSellingPrice === 0 ? "" : line.mandatedSellingPrice}
                    placeholder={b ? String(b.unit_price) : "0"}
                    onChange={(e) =>
                      updateLine(i, { mandatedSellingPrice: Number(e.target.value) || 0 })
                    }
                    className="rounded-full h-10 text-right mt-1"
                  />
                </div>
                <div className="col-span-12 sm:col-span-2 flex justify-end">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeLine(i)}
                    className="rounded-full text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex items-center justify-between pt-2 border-t border-border">
          <div className="text-sm text-muted-foreground">
            <Package className="inline h-4 w-4 mr-1" />
            {totalUnits} units across {lines.length} line(s)
          </div>
          <Button
            onClick={submit}
            disabled={busy || dispatchMutation.isPending}
            className="rounded-full shadow-pink h-11 px-6"
          >
            {busy || dispatchMutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            {busy || dispatchMutation.isPending ? "Sending…" : "Send dispatch"}
          </Button>
        </div>
      </div>

      {/* ── Recent Dispatches Table ── */}
      <section className="rounded-2xl bg-card shadow-card overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex flex-col sm:flex-row sm:items-center gap-4">
          <h2 className="font-bold">Recent dispatches</h2>
          <div className="relative flex-1 max-w-sm ml-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={recentSearch}
              onChange={(e) => setRecentSearch(e.target.value)}
              placeholder="Search shop, notes, status…"
              className="pl-10 rounded-full h-9 text-sm"
            />
          </div>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-4">When</th>
              <th className="text-left p-4">Shop</th>
              <th className="text-right p-4">Units</th>
              <th className="text-left p-4">Notes</th>
              <th className="text-right p-4">Status</th>
            </tr>
          </thead>
          <tbody>
            {filteredRecent.map((d: any) => {
              const totalQty = (d.items ?? []).reduce(
                (s: number, it: any) => s + (it.quantity ?? 0),
                0,
              );
              return (
                <tr key={d._id} className="border-t border-border">
                  <td className="p-4">{new Date(d.createdAt).toLocaleString()}</td>
                  <td className="p-4 font-semibold">{d.shopId?.name || "Unknown Shop"}</td>
                  <td className="p-4 text-right font-bold">{totalQty || d.totalQuantity || "—"}</td>
                  <td className="p-4 text-muted-foreground">{d.notes || "—"}</td>
                  <td className="p-4 text-right">
                    <span
                      className={`px-3 py-1 rounded-full text-xs font-bold ${
                        d.status === "confirmed"
                          ? "bg-accent/10 text-accent"
                          : d.status === "in_transit"
                            ? "bg-tertiary/10 text-tertiary"
                            : d.status === "rejected"
                              ? "bg-destructive/10 text-destructive"
                              : "bg-primary/10 text-primary"
                      }`}
                    >
                      {d.status.replace("_", " ")}
                    </span>
                  </td>
                </tr>
              );
            })}
            {filteredRecent.length === 0 && (
              <tr>
                <td colSpan={5} className="p-10 text-center text-muted-foreground">
                  No dispatches yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
