import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Plus,
  Pill,
  Trash2,
  Pencil,
  Check,
  X,
  IndianRupee,
  PackagePlus,
} from "lucide-react";
import { toast } from "sonner";
import { useSocket } from "@/hooks/useSocket";

export const Route = createFileRoute("/admin/medicines")({ component: Page });

const API_URL = "http://localhost:5000/api";

const fmt = (n: number) =>
  "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function Page() {
  const queryClient = useQueryClient();
  const { onWarehouseUpdated, onMedicinesUpdated } = useSocket();

  // Add form state
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [basePrice, setBasePrice] = useState("");
  const [openingBatchNo, setOpeningBatchNo] = useState("");
  const [openingQty, setOpeningQty] = useState("");
  const [openingExpiry, setOpeningExpiry] = useState("");
  useEffect(() => {
    const unsubWarehouse = onWarehouseUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    });
    const unsubMedicines = onMedicinesUpdated(() => {
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    });
    return () => {
      unsubWarehouse?.();
      unsubMedicines?.();
    };
  }, [onWarehouseUpdated, onMedicinesUpdated, queryClient]);


  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCategory, setEditCategory] = useState("");
  const [editPrice, setEditPrice] = useState("");

  // Add Batch state — which medicine's batch dialog is open
  const [batchMedicineId, setBatchMedicineId] = useState<string | null>(null);
  const [batchNo, setBatchNo] = useState("");
  const [batchQty, setBatchQty] = useState("");
  const [batchExpiry, setBatchExpiry] = useState("");
  const [batchUnitPrice, setBatchUnitPrice] = useState("");
  const [batchBusy, setBatchBusy] = useState(false);

  // Medicines list
  const { data: medicines = [], isLoading } = useQuery({
    queryKey: ["medicines"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/inventory/medicines`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch medicines");
      return res.json();
    },
    refetchInterval: 5000,
  });

  // Warehouse batches (to show batch numbers per medicine)
  const { data: batchRows = [] } = useQuery({
    queryKey: ["inventory"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/inventory`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      return res.json();
    },
    staleTime: 0,
    refetchInterval: 5_000,
  });

  // Inventory stats (warehouseStock, stockStatus per medicine)
  const { data: stats = [] } = useQuery({
    queryKey: ["inventory-stats"],
    queryFn: async () => {
      const res = await fetch(`${API_URL}/inventory/stats`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch stats");
      return res.json();
    },
    refetchInterval: 5000,
  });

  const statsMap = new Map<string, any>();
  for (const s of stats as any[]) statsMap.set(s._id.toString(), s);

  // Add medicine
  const addMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API_URL}/inventory/medicines`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add medicine");
      }
      const medicineResp = await res.json();

      const batchRes = await fetch(`${API_URL}/inventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          medicineName: payload.name,
          category: payload.category,
          batchNumber: payload.openingBatchNo,
          stock: payload.openingQty,
          expiryDate: payload.openingExpiry,
          price: payload.basePrice,
        }),
      });
      if (!batchRes.ok) {
        const err = await batchRes.json();
        throw new Error(err.message || "Medicine created, but failed to add opening batch");
      }

      return medicineResp;
    },
    onSuccess: () => {
      toast.success("Medicine + opening batch added successfully!");
      setOpen(false);
      setName("");
      setCategory("");
      setBasePrice("");
      setOpeningBatchNo("");
      setOpeningQty("");
      setOpeningExpiry("");
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
    onSettled: () => setBusy(false),
  });

  // Update medicine (inline)
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: any }) => {
      const res = await fetch(`${API_URL}/inventory/medicines/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to update medicine");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Medicine updated!");
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Delete medicine
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${API_URL}/inventory/medicines/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to delete medicine");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Medicine deleted.");
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
  });

  // Add Batch mutation
  const addBatchMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API_URL}/inventory`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || "Failed to add batch");
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success("Stock batch added!");
      setBatchMedicineId(null);
      setBatchNo("");
      setBatchQty("");
      setBatchExpiry("");
      setBatchUnitPrice("");
      queryClient.invalidateQueries({ queryKey: ["inventory"] });
      queryClient.invalidateQueries({ queryKey: ["inventory-stats"] });
      queryClient.invalidateQueries({ queryKey: ["medicines"] });
      queryClient.invalidateQueries({ queryKey: ["admin-stats"] });
    },
    onError: (err: any) => toast.error(err.message),
    onSettled: () => setBatchBusy(false),
  });

  const openBatchDialog = (m: any) => {
    setBatchMedicineId(m._id);
    setBatchNo("");
    setBatchQty("");
    setBatchExpiry("");
    setBatchUnitPrice(String(m.basePrice ?? 0));
    setEditingId(null); // close any open edit row
  };

  const submitBatch = (e: React.FormEvent, medicine: any) => {
    e.preventDefault();
    if (!batchNo.trim()) return toast.error("Batch number required");
    if (!batchQty || Number(batchQty) <= 0) return toast.error("Quantity must be > 0");
    if (!batchExpiry) return toast.error("Expiry date required");
    setBatchBusy(true);
    addBatchMutation.mutate({
      medicineName: medicine.name,
      category: medicine.category,
      batchNumber: batchNo.trim(),
      stock: Number(batchQty),
      expiryDate: batchExpiry,
      price: Number(batchUnitPrice) || medicine.basePrice || 0,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return toast.error("Medicine name is required");
    if (!basePrice || Number(basePrice) <= 0) return toast.error("Enter a valid price per unit");
    if (!openingBatchNo.trim()) return toast.error("Batch number is required");
    if (!openingQty || Number(openingQty) <= 0) return toast.error("Opening quantity is required");
    if (!openingExpiry) return toast.error("Expiry date is required");
    setBusy(true);
    addMutation.mutate({
      name: name.trim(),
      category: category.trim(),
      basePrice: Number(basePrice),
      openingBatchNo: openingBatchNo.trim(),
      openingQty: Number(openingQty),
      openingExpiry,
    });
  };

  const startEdit = (m: any) => {
    setEditingId(m._id);
    setEditName(m.name);
    setEditCategory(m.category ?? "");
    setEditPrice(String(m.basePrice ?? 0));
  };

  const confirmEdit = (id: string) => {
    if (!editName.trim()) return toast.error("Name cannot be empty");
    if (Number(editPrice) < 0) return toast.error("Price cannot be negative");
    updateMutation.mutate({
      id,
      data: {
        name: editName.trim(),
        category: editCategory.trim(),
        basePrice: Number(editPrice),
      },
    });
  };

  return (
    <div className="space-y-6">
      <header className="flex justify-between items-end">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
            <Pill className="h-7 w-7 text-primary" /> Medicines Master
          </h1>
          <p className="text-muted-foreground">
            Batch-wise stock with live warehouse totals.
          </p>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button className="rounded-full shadow-pink">
              <Plus className="mr-2 h-4 w-4" /> Add Medicine
            </Button>
          </DialogTrigger>
          <DialogContent className="sm:max-w-[420px]">
            <DialogHeader>
              <DialogTitle>Add New Medicine</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div className="space-y-1.5">
                <Label htmlFor="opening-batch">Batch Number *</Label>
                <Input
                  id="opening-batch"
                  required
                  value={openingBatchNo}
                  onChange={(e) => setOpeningBatchNo(e.target.value)}
                  placeholder="e.g. COB-001"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="med-name">Medicine Name *</Label>
                <Input
                  id="med-name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Paracetamol"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="med-price">Price / Unit (₹) *</Label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="med-price"
                      type="number"
                      step="0.01"
                      min="0.01"
                      required
                      value={basePrice}
                      onChange={(e) => setBasePrice(e.target.value)}
                      placeholder="0.00"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="opening-qty">Quantity *</Label>
                  <Input
                    id="opening-qty"
                    type="number"
                    min="1"
                    required
                    value={openingQty}
                    onChange={(e) => setOpeningQty(e.target.value)}
                    placeholder="e.g. 1000"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="opening-value">Auto Calculated Price</Label>
                <Input
                  id="opening-value"
                  value={
                    basePrice && openingQty && Number(basePrice) > 0 && Number(openingQty) > 0
                      ? fmt(Number(basePrice) * Number(openingQty))
                      : "₹0.00"
                  }
                  readOnly
                  className="bg-secondary/40"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="opening-expiry">Expiry Date *</Label>
                  <Input
                    id="opening-expiry"
                    type="date"
                    required
                    value={openingExpiry}
                    onChange={(e) => setOpeningExpiry(e.target.value)}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="med-cat">Category</Label>
                  <Input
                    id="med-cat"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    placeholder="e.g. Tablets, Syrup, Injection"
                  />
                </div>
              </div>

              {/* Live preview of opening batch value */}
              {basePrice && openingQty && Number(basePrice) > 0 && Number(openingQty) > 0 && (
                <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Opening batch value</span>
                  <span className="font-extrabold text-primary text-lg">
                    {fmt(Number(basePrice) * Number(openingQty))}
                  </span>
                </div>
              )}

              <p className="text-xs text-muted-foreground">
                Medicine save karte hi batch warehouse me add ho jayega, aur dispatch me batch number live dikhega.
              </p>

              <Button
                type="submit"
                disabled={busy}
                className="w-full rounded-full shadow-pink mt-2"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save Medicine"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </header>

      <div className="rounded-2xl bg-card shadow-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-secondary/40 text-xs uppercase tracking-widest text-muted-foreground">
            <tr>
              <th className="text-left p-4">Medicine</th>
              <th className="text-left p-4">Category</th>
              <th className="text-right p-4">Price / Unit</th>
              <th className="text-left p-4">Batch</th>
              <th className="text-right p-4">Stock</th>
              <th className="text-right p-4">Total Value</th>
              <th className="text-right p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr>
                <td colSpan={7} className="p-12 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                </td>
              </tr>
            ) : medicines.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-12 text-center text-muted-foreground">
                  No medicines yet — add your first medicine above.
                </td>
              </tr>
            ) : (
              medicines.map((m: any) => {
                const s = statsMap.get(m._id);
                const isEditing = editingId === m._id;
                const warehouseStock = s?.warehouseStock ?? 0;
                const dispatchedConfirmed = s?.dispatched ?? 0;
                const pendingPipeline = s?.pending ?? 0;
                const orderedFromDb = Number(m.orderedQuantity) || 0;
                const orderedStock =
                  orderedFromDb > 0
                    ? orderedFromDb
                    : warehouseStock + dispatchedConfirmed;
                const totalValue = orderedStock * (m.basePrice ?? 0);
                const medicineBatches = (batchRows as any[]).filter(
                  (b) => b.medicines?.name?.toLowerCase() === m.name?.toLowerCase(),
                );

                return (
                  <>
                    <tr
                      key={m._id}
                      className="border-t border-border hover:bg-secondary/20 transition-colors"
                    >
                      {/* Name */}
                      <td className="p-4 font-semibold">
                        {isEditing ? (
                          <Input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="h-8 rounded-full text-sm w-36"
                            autoFocus
                          />
                        ) : (
                          m.name
                        )}
                      </td>

                      {/* Category */}
                      <td className="p-4">
                        {isEditing ? (
                          <Input
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="h-8 rounded-full text-sm w-28"
                            placeholder="Category"
                          />
                        ) : (
                          <span className="text-tertiary font-medium">
                            {m.category || <span className="text-muted-foreground italic">—</span>}
                          </span>
                        )}
                      </td>

                      {/* Price per unit */}
                      <td className="p-4 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="text-muted-foreground text-xs">₹</span>
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={editPrice}
                              onChange={(e) => setEditPrice(e.target.value)}
                              className="h-8 rounded-full text-sm w-24 text-right"
                            />
                          </div>
                        ) : (
                          <span className="font-bold text-primary">{fmt(m.basePrice ?? 0)}</span>
                        )}
                      </td>

                      {/* Batch numbers (warehouse batches for this medicine) */}
                      <td className="p-4">
                        {medicineBatches.length > 0 ? (
                          <div className="space-y-1">
                            {medicineBatches.map((b: any) => (
                              <div key={b.id} className="font-mono text-sm font-semibold text-foreground">
                                {b.batch_number}
                                <span className="ml-1.5 text-[10px] font-normal text-muted-foreground">
                                  ({b.stock} in warehouse)
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-xs">—</span>
                        )}
                      </td>

                      {/* Stock = ordered quantity (fixed; does not drop when dispatch happens) */}
                      <td className="p-4 text-right">
                        <span className="font-bold text-foreground">{orderedStock.toLocaleString()}</span>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          ordered total
                          {warehouseStock !== orderedStock && (
                            <span className="block text-accent">
                              {warehouseStock.toLocaleString()} in warehouse now
                            </span>
                          )}
                        </div>
                        {pendingPipeline > 0 && (
                          <div className="text-[10px] text-muted-foreground">
                            {pendingPipeline.toLocaleString()} in transit / pending
                          </div>
                        )}
                      </td>

                      {/* Total Value = ordered stock × price */}
                      <td className="p-4 text-right">
                        <div>
                          <div className="font-semibold text-accent">{fmt(totalValue)}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {orderedStock} × {fmt(m.basePrice ?? 0)}
                          </div>
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isEditing ? (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full text-accent hover:text-accent h-8 w-8 p-0"
                                onClick={() => confirmEdit(m._id)}
                                disabled={updateMutation.isPending}
                              >
                                {updateMutation.isPending ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Check className="h-3.5 w-3.5" />
                                )}
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full text-muted-foreground h-8 w-8 p-0"
                                onClick={() => setEditingId(null)}
                              >
                                <X className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full text-muted-foreground hover:text-accent h-8 w-8 p-0"
                                onClick={() => openBatchDialog(m)}
                                title="Add stock batch"
                              >
                                <PackagePlus className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full text-muted-foreground hover:text-primary h-8 w-8 p-0"
                                onClick={() => startEdit(m)}
                                title="Edit"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full text-muted-foreground hover:text-destructive h-8 w-8 p-0"
                                onClick={() => {
                                  if (confirm(`Delete "${m.name}" and all its batches?`)) {
                                    deleteMutation.mutate(m._id);
                                  }
                                }}
                                disabled={deleteMutation.isPending}
                                title="Delete"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>

                    {/* ── Inline Add Batch form row ── */}
                    {batchMedicineId === m._id && (
                      <tr
                        key={`batch-${m._id}`}
                        className="border-t border-primary/30 bg-primary/5"
                      >
                        <td colSpan={7} className="px-6 py-4">
                          <form onSubmit={(e) => submitBatch(e, m)} className="space-y-3">
                            <div className="flex items-center gap-2 mb-2">
                              <PackagePlus className="h-4 w-4 text-primary" />
                              <span className="font-semibold text-sm text-primary">
                                Add Stock Batch for <em>{m.name}</em>
                              </span>
                              <button
                                type="button"
                                onClick={() => setBatchMedicineId(null)}
                                className="ml-auto text-muted-foreground hover:text-foreground"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs">Batch Number *</Label>
                                <Input
                                  value={batchNo}
                                  onChange={(e) => setBatchNo(e.target.value)}
                                  placeholder="e.g. BATCH-001"
                                  className="h-9 rounded-full text-sm"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Quantity *</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  value={batchQty}
                                  onChange={(e) => setBatchQty(e.target.value)}
                                  placeholder="e.g. 500"
                                  className="h-9 rounded-full text-sm"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Expiry Date *</Label>
                                <Input
                                  type="date"
                                  value={batchExpiry}
                                  onChange={(e) => setBatchExpiry(e.target.value)}
                                  className="h-9 rounded-full text-sm"
                                  required
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs">Price / Unit (₹)</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  min="0"
                                  value={batchUnitPrice}
                                  onChange={(e) => setBatchUnitPrice(e.target.value)}
                                  placeholder={`auto: ₹${m.basePrice}`}
                                  className="h-9 rounded-full text-sm"
                                />
                              </div>
                            </div>
                            {batchQty &&
                              batchUnitPrice &&
                              Number(batchQty) > 0 &&
                              Number(batchUnitPrice) > 0 && (
                                <div className="text-xs text-muted-foreground">
                                  Batch value:{" "}
                                  <span className="font-bold text-primary">
                                    ₹
                                    {(Number(batchQty) * Number(batchUnitPrice)).toLocaleString(
                                      "en-IN",
                                    )}
                                  </span>
                                </div>
                              )}
                            <div className="flex gap-2 pt-1">
                              <Button
                                type="submit"
                                disabled={batchBusy}
                                className="rounded-full shadow-pink h-9 px-5 text-sm"
                              >
                                {batchBusy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  "Save Batch"
                                )}
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                onClick={() => setBatchMedicineId(null)}
                                className="rounded-full h-9 px-5 text-sm"
                              >
                                Cancel
                              </Button>
                            </div>
                          </form>
                        </td>
                      </tr>
                    )}
                  </>
                );
              })
            )}
          </tbody>
        </table>

        {/* Footer note */}
        {medicines.length > 0 && (
          <div className="px-6 py-3 border-t border-border bg-secondary/30 flex items-center gap-6 text-xs text-muted-foreground flex-wrap">
            <span className="flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5 shrink-0" />
              Click ✏️ to edit. Stock column shows total ordered quantity; new batches add to that total.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
