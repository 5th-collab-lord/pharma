import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useSocket } from "@/hooks/useSocket";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Search, Plus, Minus, Trash2, ShoppingCart, Receipt } from "lucide-react";
import { generateInvoicePdf, fmtInr } from "@/lib/invoice";

export const Route = createFileRoute("/shop/pos")({ component: Page });

interface InvRow {
  batch_id: string;
  medicine_id: string;
  stock: number;
  batch_number: string;
  expiry_date: string;
  unit_price: number;
  name: string;
  sku: string;
}
interface CartLine {
  batch_id: string;
  medicine_id: string;
  name: string;
  batch_number: string;
  unit_price: number;
  qty: number;
  max: number;
}

const TAX_RATE = 0.05;
const API_URL = "http://localhost:5000/api";

function Page() {
  const { profile } = useAuth();
  const { onInventoryUpdated } = useSocket();
  const [inv, setInv] = useState<InvRow[]>([]);
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [phone, setPhone] = useState("");
  const [pay, setPay] = useState<"cash" | "card" | "upi">("cash");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(`${API_URL}/inventory/shop`, {
        headers: { Authorization: `Bearer ${localStorage.getItem("token")}` },
      });
      if (!res.ok) throw new Error("Failed to fetch inventory");
      const data = await res.json();

      const flat: InvRow[] = (data as any[])
        .map((r: any) => {
          const b = r.batchId ?? null;
          const m = r.medicineId ?? null;
          const expRaw = b?.expiryDate ?? r.batches?.expiry_date;
          const expStr =
            expRaw && expRaw !== "N/A"
              ? new Date(expRaw).toLocaleDateString()
              : "N/A";
          return {
            batch_id: String(b?._id ?? ""),
            medicine_id: String(m?._id ?? ""),
            stock: r.stock,
            batch_number: b?.batchNumber ?? r.batches?.batch_number ?? "N/A",
            expiry_date: expStr,
            unit_price: Number(
              r.authorisedRetailPrice ?? r.retailPrice ?? b?.price ?? r.batches?.unit_price ?? 0,
            ),
            name: m?.name ?? r.medicines?.name ?? "Unknown",
            sku: m?.sku ?? r.medicines?.sku ?? "N/A",
          };
        })
        .filter((row) => row.batch_id && row.medicine_id);
      setInv(flat);
    } catch (e) {
      console.error(e);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    return onInventoryUpdated(() => {
      refresh();
    });
  }, [onInventoryUpdated, refresh]);

  const filtered = useMemo(() => {
    const term = q.toLowerCase().trim();
    if (!term) return inv;
    const terms = term.split(/\s+/);
    return inv.filter((r) => {
      const searchStr = `${r.name} ${r.sku || ""} ${r.batch_number || ""}`.toLowerCase();
      return terms.every((t) => searchStr.includes(t));
    });
  }, [inv, q]);

  const addToCart = (r: InvRow) => {
    setCart((p) => {
      const exist = p.find((l) => l.batch_id === r.batch_id);
      if (exist) {
        if (exist.qty >= r.stock) {
          toast.error(`Only ${r.stock} in stock`);
          return p;
        }
        return p.map((l) => (l.batch_id === r.batch_id ? { ...l, qty: l.qty + 1 } : l));
      }
      return [
        ...p,
        {
          batch_id: r.batch_id,
          medicine_id: r.medicine_id,
          name: r.name,
          batch_number: r.batch_number,
          unit_price: r.unit_price,
          qty: 1,
          max: r.stock,
        },
      ];
    });
  };
  const setQty = (bid: string, qty: number) =>
    setCart((p) =>
      p.map((l) => (l.batch_id === bid ? { ...l, qty: Math.max(1, Math.min(qty, l.max)) } : l)),
    );
  const remove = (bid: string) => setCart((p) => p.filter((l) => l.batch_id !== bid));

  const subtotal = cart.reduce((s, l) => s + l.qty * l.unit_price, 0);
  const tax = subtotal * TAX_RATE;
  const total = subtotal + tax;

  const checkout = async () => {
    if (cart.length === 0) return toast.error("Cart is empty");
    setBusy(true);
    try {
      // POST to our new Node POS endpoint
      const res = await fetch(`${API_URL}/pos/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${localStorage.getItem("token")}`,
        },
        body: JSON.stringify({
          customerName: customer,
          customerPhone: phone,
          paymentMethod: pay,
          items: cart,
          subtotal,
          tax,
          total,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Checkout failed");
      }

      const sale = await res.json();

      generateInvoicePdf({
        receiptNo: sale.receiptNo,
        shopName: "KK Pharma - Local Branch", // Update this when shop details are available
        shopLocation: "Branch Location",
        customerName: customer,
        customerPhone: phone,
        cashier: profile?.full_name || "Pharmacist",
        paymentMethod: pay,
        createdAt: new Date(),
        items: cart.map((l) => ({
          name: l.name,
          batch: l.batch_number,
          qty: l.qty,
          unitPrice: l.unit_price,
          lineTotal: l.qty * l.unit_price,
        })),
        subtotal,
        tax,
        total,
      });

      toast.success(`Sale recorded — ${sale.receiptNo}`);
      setCart([]);
      setCustomer("");
      setPhone("");
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? "Checkout failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
          <ShoppingCart className="h-7 w-7 text-primary" /> Point of Sale
        </h1>
        <p className="text-muted-foreground">Build the cart, take payment, print the receipt.</p>
      </header>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Catalog */}
        <div className="lg:col-span-2 space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or batch number…"
              className="pl-11 h-12 rounded-full"
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-3 max-h-[65vh] overflow-y-auto pr-1">
            {filtered.map((r) => (
              <button
                key={r.batch_id}
                onClick={() => addToCart(r)}
                className="text-left rounded-2xl bg-card p-4 shadow-card hover:shadow-pink hover:-translate-y-0.5 transition-all"
              >
                <div className="flex justify-between items-start">
                  <div className="font-bold">{r.name}</div>
                  <div className="text-primary font-extrabold">{fmtInr(r.unit_price)}</div>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {r.sku} · Batch {r.batch_number}
                </div>
                <div className="text-xs mt-2 flex justify-between">
                  <span className="text-muted-foreground">Exp {r.expiry_date}</span>
                  <span className={`font-bold ${r.stock < 10 ? "text-primary" : "text-accent"}`}>
                    {r.stock} in stock
                  </span>
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="col-span-2 text-center text-sm text-muted-foreground py-12">
                No matching stock.
              </div>
            )}
          </div>
        </div>

        {/* Cart */}
        <div className="rounded-2xl bg-card shadow-card p-5 flex flex-col h-fit lg:sticky lg:top-6">
          <h2 className="font-bold mb-3 flex items-center gap-2">
            <Receipt className="h-4 w-4" /> Cart ({cart.length})
          </h2>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {cart.map((l) => (
              <div key={l.batch_id} className="rounded-xl bg-secondary/40 p-3">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm truncate">{l.name}</div>
                    <div className="text-xs text-muted-foreground">
                      B-{l.batch_number} · {fmtInr(l.unit_price)}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(l.batch_id)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="flex justify-between items-center mt-2">
                  <div className="flex items-center gap-1 bg-card rounded-full p-1">
                    <button
                      onClick={() => setQty(l.batch_id, l.qty - 1)}
                      className="h-6 w-6 grid place-items-center rounded-full hover:bg-secondary"
                    >
                      <Minus className="h-3 w-3" />
                    </button>
                    <span className="text-sm font-bold w-8 text-center">{l.qty}</span>
                    <button
                      onClick={() => setQty(l.batch_id, l.qty + 1)}
                      className="h-6 w-6 grid place-items-center rounded-full hover:bg-secondary"
                    >
                      <Plus className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="font-bold text-sm">{fmtInr(l.qty * l.unit_price)}</div>
                </div>
              </div>
            ))}
            {cart.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-6">
                Tap a medicine to add it.
              </div>
            )}
          </div>

          <div className="border-t border-border mt-4 pt-4 space-y-2 text-sm">
            <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 items-baseline min-w-0">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="text-right tabular-nums">{fmtInr(subtotal)}</span>
              <span className="text-muted-foreground">Tax (5%)</span>
              <span className="text-right tabular-nums">{fmtInr(tax)}</span>
            </div>
            <div className="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 items-baseline pt-2 border-t border-border font-extrabold text-lg">
              <span>Total</span>
              <span className="text-primary text-right tabular-nums">{fmtInr(total)}</span>
            </div>
          </div>

          <div className="space-y-2 mt-4">
            <Input
              placeholder="Customer name (optional)"
              value={customer}
              onChange={(e) => setCustomer(e.target.value)}
              className="rounded-full h-10 text-sm"
            />
            <Input
              placeholder="Phone (optional)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="rounded-full h-10 text-sm"
            />
            <div className="grid grid-cols-3 gap-1 bg-secondary/50 rounded-full p-1">
              {(["cash", "card", "upi"] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setPay(m)}
                  className={`text-xs font-bold py-2 rounded-full transition-all uppercase ${pay === m ? "bg-gradient-primary text-white shadow-pink" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>

          <Button
            onClick={checkout}
            disabled={busy || cart.length === 0}
            className="rounded-full h-12 mt-4 shadow-pink font-bold"
          >
            {busy ? "Processing…" : `Charge ${fmtInr(total)}`}
          </Button>
        </div>
      </div>
    </div>
  );
}
