# KK Pharma — Complete Project Documentation

> Multi-branch pharmacy management system with central warehouse, dispatch, POS, real-time analytics, and role-based access.

---

## Table of Contents

1. [Project Structure](#1-project-structure)
2. [Tech Stack](#2-tech-stack)
3. [Database Models](#3-database-models)
4. [Backend API Reference](#4-backend-api-reference)
5. [Complete Code Flow](#5-complete-code-flow)
   - [Authentication Flow](#51-authentication-flow)
   - [Medicines & Inventory Flow](#52-medicines--inventory-flow)
   - [Dispatch Flow](#53-dispatch-flow)
   - [POS / Sale Flow](#54-pos--sale-flow)
   - [Analytics & Reports Flow](#55-analytics--reports-flow)
   - [Real-time (Socket.io) Flow](#56-real-time-socketio-flow)
   - [Active Shops (Online Tracking) Flow](#57-active-shops-online-tracking-flow)
6. [Frontend Pages Reference](#6-frontend-pages-reference)
7. [Security & Fixes Applied](#7-security--fixes-applied)
8. [Known Limitations & Current State](#8-known-limitations--current-state)
9. [Performance Roadmap](#9-performance-roadmap)
   - [Phase 1 — Quick Wins (1–2 weeks)](#phase-1--quick-wins-12-weeks)
   - [Phase 2 — Architecture (1 month)](#phase-2--architecture-1-month)
   - [Phase 3 — Scale (2–3 months)](#phase-3--scale-23-months)
10. [Environment Variables](#10-environment-variables)
11. [Running the Project](#11-running-the-project)

---

## 1. Project Structure

```
lord/
├── backend/                        # Node.js + Express API server
│   ├── controllers/
│   │   ├── admin.controller.js     # Shop approval, alerts, dashboard stats
│   │   ├── auth.controller.js      # Login, register, logout, online tracking
│   │   ├── dispatch.controller.js  # Create/accept/reject dispatches, stock summary
│   │   ├── inventory.controller.js # Warehouse batches, medicines CRUD, stats
│   │   ├── pos.controller.js       # Checkout, sales, refunds
│   │   └── reports.controller.js   # Analytics, trends, custom filters
│   ├── middleware/
│   │   └── auth.middleware.js      # JWT verify, isAdmin guard
│   ├── models/
│   │   ├── Admin.js                # Admin user schema
│   │   ├── Batch.js                # Warehouse stock batch
│   │   ├── Dispatch.js             # Dispatch record
│   │   ├── DispatchItem.js         # Individual items in a dispatch
│   │   ├── DispatchLog.js          # Audit log for dispatch state changes
│   │   ├── Medicine.js             # Medicine master (name, category, basePrice)
│   │   ├── Sale.js                 # POS sale record
│   │   ├── Shop.js                 # Shop profile (isActive, isOnline)
│   │   ├── ShopInventory.js        # Shop-level stock (per batch)
│   │   ├── ShopUser.js             # Shop owner / pharmacist user
│   │   └── TransactionLog.js       # All financial transaction audit trail
│   ├── routes/
│   │   ├── admin.routes.js
│   │   ├── auth.routes.js
│   │   ├── dispatch.routes.js
│   │   ├── inventory.routes.js
│   │   ├── pos.routes.js
│   │   └── reports.routes.js
│   └── server.js                   # Express app, Socket.io, MongoDB connect
│
└── frontend/                       # React + TanStack Router + Vite
    └── src/
        ├── components/
        │   ├── AppSidebar.tsx       # Role-aware sidebar navigation
        │   └── RoleGuard.tsx        # Route protection by role
        ├── hooks/
        │   ├── use-mobile.tsx
        │   └── useSocket.ts         # Socket.io client hook
        ├── lib/
        │   ├── auth.tsx             # AuthContext, signIn, signOut, online tracking
        │   ├── invoice.ts           # PDF invoice generator (jsPDF)
        │   └── utils.ts
        └── routes/
            ├── __root.tsx           # Root layout, QueryClient, AuthProvider
            ├── index.tsx            # Landing page
            ├── auth.tsx             # Login + Register page
            ├── admin.tsx            # Admin layout + RoleGuard
            ├── admin.index.tsx      # Admin dashboard
            ├── admin.medicines.tsx  # Medicine master CRUD
            ├── admin.inventory.tsx  # Warehouse inventory + stats
            ├── admin.dispatch.tsx   # Dispatch builder + stock summary
            ├── admin.alerts.tsx     # Low stock + expiry alerts
            ├── admin.analytics.tsx  # Revenue analytics + custom filter
            ├── admin.receipts.tsx   # Sales receipts viewer
            ├── shop.tsx             # Shop layout + RoleGuard
            ├── shop.index.tsx       # Shop dashboard + incoming dispatches
            ├── shop.pos.tsx         # Point of Sale terminal
            ├── shop.inventory.tsx   # Shop's local inventory
            ├── shop.orders.tsx      # Incoming dispatch orders
            └── shop.receipts.tsx    # Shop's sales receipts
```

---

## 2. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend framework | React 19 + TypeScript |
| Routing | TanStack Router v1 (file-based) |
| State / data fetching | TanStack Query v5 |
| Styling | Tailwind CSS v4 |
| UI components | Radix UI + shadcn/ui |
| Charts | Recharts |
| PDF generation | jsPDF + jsPDF-AutoTable |
| Real-time | Socket.io client v4 |
| Backend runtime | Node.js (ESM) |
| Backend framework | Express.js v4 |
| Database | MongoDB (Mongoose v8) |
| Authentication | JWT (jsonwebtoken) + bcryptjs |
| Real-time server | Socket.io v4 |
| Process manager | Nodemon (dev) |

---

## 3. Database Models

### Admin
```
Collection: admins
Fields: name, email, password (hashed), role="admin"
```

### ShopUser
```
Collection: shop_users
Fields: name, email, password (hashed), role="shop", shopId → Shop
```

### Shop
```
Collection: shop_profiles
Fields: name, ownerId → ShopUser, ownerContact,
        isActive (admin approved?),
        isOnline (currently logged in?),
        lastSeenAt
```

### Medicine
```
Collection: admin_medicines
Fields: name, category, sku (auto-generated), basePrice
Index: name(unique-ish), sku(unique sparse)
```

### Batch (Warehouse Stock)
```
Collection: admin_warehouse_stock
Fields: medicineId → Medicine, batchNumber, stock, expiryDate, price
Index: medicineId, expiryDate, batchNumber
```

### ShopInventory
```
Collection: shop_local_inventory
Fields: shopId → Shop, medicineId → Medicine, batchId → Batch, stock
Index: (shopId + medicineId), (shopId + batchId), stock
```

### Dispatch
```
Collection: admin_dispatches
Fields: shopId → Shop, notes, status (created|in_transit|confirmed|rejected|delivered),
        confirmedAt, rejectedAt, createdBy → Admin
```

### DispatchItem
```
Collection: admin_dispatch_items
Fields: dispatchId → Dispatch, batchId → Batch, medicineId → Medicine, quantity
```

### DispatchLog
```
Collection: dispatch_logs
Fields: dispatchId, action (created|in_transit|confirmed|rejected), 
        performedBy (Admin|ShopUser), notes, metadata
```

### Sale
```
Collection: sales
Fields: receiptNo (unique), shopId, customerName, customerPhone,
        cashierId → ShopUser, items[{medicineId, batchId, batchNumber,
        medicineName, quantity, unitPrice, lineTotal}],
        subtotal, taxRate=0.05, taxAmount, discountAmount, total,
        paymentMethod (cash|card|upi|other), paymentStatus, status
Index: (shopId + createdAt), createdAt, status, paymentStatus
```

### TransactionLog
```
Collection: transaction_logs
Fields: type (sale|refund|dispatch_create|dispatch_confirm|dispatch_reject),
        referenceId, referenceModel, shopId, performedBy, performedByModel,
        amount, description, metadata, status (success|failed|pending), errorMessage
```

---

## 4. Backend API Reference

### Auth — `/api/auth`
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/register` | ❌ | Register new shop user + create shop (pending approval) |
| POST | `/login` | ❌ | Login (admin or shop), returns JWT. Sets `isOnline=true` for shops |
| POST | `/logout` | ❌ | Marks `isOnline=false` for shop (called on signout/tab close) |
| POST | `/online` | ✅ JWT | Re-marks shop as online (called on tab visibility restore) |
| POST | `/init-admin` | ❌ | One-time admin seed (idempotent via `ensureAdminAccount`) |

### Admin — `/api/admin` (requires JWT + isAdmin)
| Method | Path | Description |
|--------|------|-------------|
| GET | `/stats` | Dashboard totals (stock, online shops, alerts) |
| GET | `/alerts` | All alerts: shop low stock + warehouse low stock + expiring |
| GET | `/shops` | All shops (active + pending) with owner info |
| PATCH | `/shops/:id/approve` | Approve a pending shop (`isActive=true`) |
| DELETE | `/shops/:id/reject` | Reject + delete shop and its owner user |

### Inventory — `/api/inventory` (requires JWT)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/` | Any | All warehouse batches with medicine info |
| POST | `/` | Admin | Add new stock batch (auto-fills price from `medicine.basePrice`) |
| GET | `/shop` | Shop | Current shop's local inventory |
| GET | `/stats` | Admin | Per-medicine: totalEntered, warehouseStock, dispatched, pending |
| GET | `/medicines` | Any | All medicines master list |
| POST | `/medicines` | Admin | Create medicine (name, category, basePrice) |
| PATCH | `/medicines/:id` | Admin | Update medicine + propagate price to all its batches |
| DELETE | `/medicines/:id` | Admin | Delete medicine + all its batches |

### Dispatch — `/api/dispatch` (requires JWT)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/` | Admin | Create new dispatch (validates stock, no warehouse deduction yet) |
| GET | `/admin/recent` | Admin | All dispatches (paginated) with items |
| GET | `/admin/stock-summary` | Admin | Per-medicine: warehouse vs dispatched vs pending |
| PATCH | `/admin/:id/in-transit` | Admin | Mark dispatch as in_transit |
| GET | `/shop/incoming` | Shop | Incoming dispatches for this shop (created + in_transit) |
| PATCH | `/shop/:id/accept` | Shop | Accept dispatch → deduct warehouse stock → add to shop inventory |
| PATCH | `/shop/:id/reject` | Shop | Reject dispatch (warehouse stock unchanged) |

### POS — `/api/pos` (requires JWT)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/checkout` | Shop | Process sale: validate → deduct stock → save Sale → log |
| GET | `/sales/shop` | Shop | Shop's sales (paginated) |
| GET | `/sales/receipt/:receiptNo` | Shop | Single sale by receipt number |
| PATCH | `/sales/:receiptNo/cancel` | Shop | Cancel/refund sale + restore stock |
| GET | `/sales/all` | Admin | All sales across all shops (with filters + stats) |

### Reports — `/api/reports` (requires JWT)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/dashboard/shop` | Shop | Shop's today stats (stock, sales, incoming, low stock) |
| GET | `/dashboard/admin` | Admin | Admin today stats (stock, **online shops**, dispatches, sales) |
| GET | `/trend/sales` | Admin | Sales by day for N days |
| GET | `/analytics` | Admin | Today + month + year: revenue, dispatch cost, trends (daily/monthly/yearly) |
| GET | `/filter` | Admin | Custom period filter (date/month/year): revenue, dispatch cost, net, top medicines |
| GET | `/:period` | Admin | Report for daily/weekly/monthly/yearly period |

---

## 5. Complete Code Flow

### 5.1 Authentication Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        REGISTRATION                              │
│                                                                  │
│  User fills signup form                                          │
│       ↓                                                          │
│  POST /api/auth/register                                         │
│       ↓                                                          │
│  1. Check if email already exists in ShopUser                    │
│  2. Hash password with bcrypt (10 rounds)                        │
│  3. Create ShopUser (role="shop")                                │
│  4. Create Shop (isActive=false → awaiting admin approval)       │
│  5. Link Shop._id → ShopUser.shopId                              │
│       ↓                                                          │
│  Response: "Registration successful! Wait for Admin approval"    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                          LOGIN                                   │
│                                                                  │
│  User submits email + password + loginType (admin|shop)          │
│       ↓                                                          │
│  POST /api/auth/login                                            │
│       ↓                                                          │
│  If loginType=admin:                                             │
│    - Find in Admin collection                                    │
│    - Verify email matches ADMIN_EMAIL env var                    │
│    - Reject if role !== "admin"                                  │
│  If loginType=shop:                                              │
│    - Find in ShopUser collection (populate shopId)               │
│    - Check shop.isActive === true (else 403)                     │
│       ↓                                                          │
│  bcrypt.compare(password, user.password)                         │
│       ↓                                                          │
│  If shop user: Shop.isOnline = true, lastSeenAt = now            │
│       ↓                                                          │
│  JWT signed: { id, role, shopId } — expires 1d                   │
│       ↓                                                          │
│  Response: { token, user: { id, name, email, role, shopId } }    │
│       ↓                                                          │
│  Frontend: localStorage.setItem("token"), localStorage           │
│            .setItem("user") → AuthContext updated                │
│       ↓                                                          │
│  Navigate: admin → /admin, shop → /shop                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    LOGOUT / ONLINE TRACKING                      │
│                                                                  │
│  Explicit logout:                                                │
│    signOut() → capture user → clear localStorage                 │
│    → POST /api/auth/logout { shopId, role }                      │
│    → Shop.isOnline = false                                       │
│    → window.location.href = "/"                                  │
│                                                                  │
│  Tab/browser close:                                              │
│    beforeunload event → fetch(logout, { keepalive: true })       │
│    → Shop.isOnline = false                                       │
│                                                                  │
│  Page refresh (false positive fix):                              │
│    visibilitychange → document visible                           │
│    → POST /api/auth/online { shopId }                            │
│    → Shop.isOnline = true (restored)                             │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                     ADMIN APPROVAL FLOW                          │
│                                                                  │
│  Admin sees pending shops on /admin dashboard                    │
│       ↓                                                          │
│  Click "Approve" → PATCH /api/admin/shops/:id/approve            │
│       ↓                                                          │
│  Shop.isActive = true                                            │
│       ↓                                                          │
│  Shop user can now login successfully                            │
│                                                                  │
│  Click "Reject" → DELETE /api/admin/shops/:id/reject             │
│       ↓                                                          │
│  ShopUser deleted + Shop deleted                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.2 Medicines & Inventory Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                   MEDICINE MASTER SETUP                          │
│                                                                  │
│  Admin goes to /admin/medicines                                  │
│       ↓                                                          │
│  POST /api/inventory/medicines                                   │
│  { name, category, basePrice }                                   │
│       ↓                                                          │
│  1. Check duplicate name (case-insensitive)                      │
│  2. Create Medicine { name, category, basePrice }                │
│  3. Auto-generate SKU: MED-{3 letters}-{4 random chars}          │
│       ↓                                                          │
│  Medicine appears in list with:                                  │
│  - Price/Unit (editable inline)                                  │
│  - Stock Left (from inventory stats)                             │
│  - Dispatched Value = dispatched_qty × basePrice                 │
│                                                                  │
│  Edit price → PATCH /api/inventory/medicines/:id                 │
│       ↓                                                          │
│  medicine.basePrice updated                                      │
│  + Batch.updateMany({ medicineId }, { price: newPrice })         │
│  (all existing batches get new price automatically)              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   ADDING WAREHOUSE STOCK                         │
│                                                                  │
│  Admin goes to /admin/inventory → "Add Stock Batch"              │
│       ↓                                                          │
│  Select medicine from dropdown (only registered medicines)       │
│  Fill: batchNumber, quantity, expiryDate, price                  │
│  (price auto-filled from medicine.basePrice)                     │
│       ↓                                                          │
│  POST /api/inventory                                             │
│       ↓                                                          │
│  1. Find medicine by name (case-insensitive)                     │
│  2. Determine batch price:                                       │
│     - If price provided → use it + update medicine.basePrice     │
│     - If no price → use medicine.basePrice                       │
│  3. Create Batch { medicineId, batchNumber, stock, expiryDate,   │
│                    price }                                       │
│       ↓                                                          │
│  Inventory table updates (polling every 3s)                      │
│  Stats bars update: totalEntered / warehouseStock / dispatched   │
└─────────────────────────────────────────────────────────────────┘
```

### 5.3 Dispatch Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                     CREATE DISPATCH                              │
│                                                                  │
│  Admin: /admin/dispatch                                          │
│       ↓                                                          │
│  Select shop + batches + quantities                              │
│       ↓                                                          │
│  POST /api/dispatch { shopId, notes, lines: [{batchId, qty}] }   │
│       ↓                                                          │
│  1. Validate: all batches exist, qty ≤ batch.stock               │
│     (READ-ONLY phase — no writes yet)                            │
│  2. Create Dispatch { shopId, status="created", createdBy }      │
│  3. Create DispatchItem for each line                            │
│  4. Create DispatchLog { action="created" }                      │
│  5. Create TransactionLog { type="dispatch_create" }             │
│       ↓                                                          │
│  NOTE: Warehouse stock NOT deducted yet                          │
│  Socket.io: emit to shop room + admin room ("dispatchUpdate")    │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  DISPATCH STATUS LIFECYCLE                       │
│                                                                  │
│  created → in_transit → confirmed                                │
│         ↘              ↘ rejected                                │
│                                                                  │
│  Admin: PATCH /api/dispatch/admin/:id/in-transit                 │
│    → Dispatch.status = "in_transit"                              │
│    → DispatchLog { action="in_transit" }                         │
│    → Socket.io emit                                              │
│                                                                  │
│  Shop: PATCH /api/dispatch/shop/:id/accept                       │
│    Phase 1 — Validate all warehouse stock (read-only)            │
│    Phase 2 — Deduct warehouse stock (with compensation):         │
│      for each item:                                              │
│        Batch.findOneAndUpdate({stock: {$gte: qty}},              │
│                               {$inc: {stock: -qty}})             │
│        If fails → restore all previously deducted batches        │
│    Phase 3 — Add to shop inventory (upsert):                     │
│      ShopInventory.findOneAndUpdate(                             │
│        {shopId, batchId},                                        │
│        {$inc: {stock: qty}},                                     │
│        {upsert: true}                                            │
│      )                                                           │
│    Phase 4 — Dispatch.status = "confirmed"                       │
│    Phase 5 — Logs + Socket.io emit                               │
│                                                                  │
│  Shop: PATCH /api/dispatch/shop/:id/reject                       │
│    → Dispatch.status = "rejected"                                │
│    → Warehouse stock NOT touched                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 5.4 POS / Sale Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                        CHECKOUT                                  │
│                                                                  │
│  Shop user: /shop/pos                                            │
│       ↓                                                          │
│  Build cart → POST /api/pos/checkout                             │
│  { customerName, customerPhone, paymentMethod,                   │
│    items: [{batch_id, medicine_id, qty, unit_price, ...}],       │
│    subtotal, tax, total }                                        │
│       ↓                                                          │
│  Phase 1 — Server-side validation:                               │
│    - Cart not empty                                              │
│    - Recalculate totals server-side (prevent tampering)          │
│      subtotal = Σ(qty × unit_price)                              │
│      tax = subtotal × 0.05                                       │
│      total = subtotal + tax - discount                           │
│    - Verify totals match (±0.01 tolerance)                       │
│    - For each item:                                              │
│        ✓ ShopInventory exists for this batch                     │
│        ✓ shopInv.stock >= qty                                    │
│        ✓ batch.expiryDate > now (expired = rejected)             │
│        ⚠ batch.expiryDate <= 30 days → console.warn             │
│       ↓                                                          │
│  Phase 2 — Deduct stock (with compensation):                     │
│    ShopInventory.findOneAndUpdate(                               │
│      {shopId, batchId, stock: {$gte: qty}},                      │
│      {$inc: {stock: -qty}}                                       │
│    )                                                             │
│    If any fails → restore all previously deducted → error        │
│       ↓                                                          │
│  Phase 3 — Save Sale record:                                     │
│    receiptNo = KK{YY}-{6 random digits}-{4 timestamp digits}     │
│    If save fails → restore all deducted stock                    │
│       ↓                                                          │
│  TransactionLog created (best-effort)                            │
│       ↓                                                          │
│  Response: { receiptNo, sale: { id, receiptNo, total, createdAt}}│
│       ↓                                                          │
│  Frontend: generateInvoicePdf() → auto-downloads PDF receipt     │
└─────────────────────────────────────────────────────────────────┘
```

### 5.5 Analytics & Reports Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    ANALYTICS PAGE FLOW                           │
│                                                                  │
│  GET /api/reports/analytics                                      │
│       ↓                                                          │
│  Parallel aggregations:                                          │
│    todaySales   = Sale.aggregate(createdAt ≥ today)              │
│    monthSales   = Sale.aggregate(createdAt ≥ monthStart)         │
│    yearSales    = Sale.aggregate(createdAt ≥ yearStart)          │
│       ↓                                                          │
│  Dispatch cost calculation:                                      │
│    Find all confirmed dispatches                                 │
│    For each: DispatchItem × medicine.basePrice = lineCost        │
│    Bucket by confirmedAt → today / month / year                  │
│       ↓                                                          │
│  Trend data:                                                     │
│    dailyTrend   = last 30 days, grouped by YYYY-MM-DD            │
│    monthlyTrend = last 12 months, grouped by YYYY-MM             │
│    yearlyTrend  = last 5 years, grouped by YYYY                  │
│       ↓                                                          │
│  Response: { today, month, year, trends: {daily, monthly, yearly}}│
│       ↓                                                          │
│  Frontend shows:                                                 │
│    3 cards (Today / Month / Year):                               │
│      - Sales Revenue                                             │
│      - Dispatch Cost (admin's purchase cost)                     │
│      - Net Profit = Revenue - Dispatch Cost (green/red)          │
│    Revenue Trend chart (switchable: 30d / 12m / 5y)              │
│    Orders bar chart                                              │
│                                                                  │
│  CUSTOM FILTER: GET /api/reports/filter                          │
│  ?filterType=date&date=YYYY-MM-DD                                │
│  ?filterType=month&month=YYYY-MM                                 │
│  ?filterType=year&year=YYYY                                      │
│       ↓                                                          │
│  Returns: revenue, orders, avgOrder, dispatchCost, net,          │
│           dailyBreakdown[], topMedicines[]                       │
└─────────────────────────────────────────────────────────────────┘
```

### 5.6 Real-time (Socket.io) Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                      SOCKET.IO ROOMS                             │
│                                                                  │
│  Client connect → socket.emit("join-admin") [admin users]        │
│               OR → socket.emit("join-shop", shopId) [shops]      │
│                                                                  │
│  Events emitted by server:                                       │
│                                                                  │
│  "dispatchUpdate" → to shop room + admin room                    │
│    payload: { type: "created"|"in_transit"|"confirmed"|          │
│               "rejected", dispatch/dispatchId }                  │
│    Triggers: queryClient.invalidateQueries                       │
│              (shop-incoming-dispatches, shop-inventory)          │
│                                                                  │
│  "inventoryUpdated" → to shop room                               │
│    Triggers: queryClient.invalidateQueries                       │
│              (shop-inventory, shop-dashboard-stats)              │
└─────────────────────────────────────────────────────────────────┘
```

### 5.7 Active Shops (Online Tracking) Flow

```
┌─────────────────────────────────────────────────────────────────┐
│  Shop Login  → Shop.isOnline = true                              │
│  Shop Logout → Shop.isOnline = false                             │
│  Tab close   → beforeunload → fetch(logout, keepalive:true)      │
│  Page refresh → briefly offline → visibilitychange restores      │
│                                                                  │
│  Admin Dashboard "Active Shops" count:                           │
│  Shop.countDocuments({ isActive: true, isOnline: true })         │
│  (polled every 5 seconds)                                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## 6. Frontend Pages Reference

### Admin Pages

| Route | File | Key Features |
|-------|------|-------------|
| `/admin` | `admin.index.tsx` | Stats cards, alerts panel, pending shop approvals table |
| `/admin/medicines` | `admin.medicines.tsx` | Medicine master list, add/edit (inline) /delete, price + dispatched value |
| `/admin/inventory` | `admin.inventory.tsx` | Per-medicine stats bars, all warehouse batches, add stock batch modal |
| `/admin/dispatch` | `admin.dispatch.tsx` | Stock distribution cards, batch picker, send dispatch, recent dispatches table |
| `/admin/alerts` | `admin.alerts.tsx` | Low stock alerts (shop + warehouse), expiry alerts |
| `/admin/analytics` | `admin.analytics.tsx` | Today/month/year revenue+cost+net, trend charts, custom date/month/year filter |
| `/admin/receipts` | `admin.receipts.tsx` | All sales receipts viewer |

### Shop Pages

| Route | File | Key Features |
|-------|------|-------------|
| `/shop` | `shop.index.tsx` | Stats cards, incoming dispatch notifications with accept/reject |
| `/shop/pos` | `shop.pos.tsx` | Searchable medicine catalog, cart, checkout, auto PDF receipt |
| `/shop/inventory` | `shop.inventory.tsx` | Shop's local inventory (by batch) |
| `/shop/orders` | `shop.orders.tsx` | Incoming dispatches with expandable item details |
| `/shop/receipts` | `shop.receipts.tsx` | Shop's past sales receipts |

---

## 7. Security & Fixes Applied

| # | Issue | Fix Applied |
|---|-------|-------------|
| 1 | Supabase calls in analytics/alerts pages | Migrated to Node.js API |
| 2 | Express route `/:period` swallowing `/dashboard/admin` | Reordered: static routes before dynamic |
| 3 | `total` used in catch before declaration | Moved `req.body` destructuring before session/try |
| 4 | `else if` alert counting bug | Changed to two separate `if` statements |
| 5 | `profile.role` doesn't exist on AuthProfile in socket hook | Used `role` from `useAuth()` directly |
| 6 | Password re-hashed every server restart | Added `bcrypt.compare` check — only re-hash on mismatch |
| 7 | Duplicate receipt number generators (controller + model) | Removed model's `pre('save')` hook, controller is single source |
| 8 | Hardcoded admin credentials as fallback | Throws error if `ADMIN_EMAIL`/`ADMIN_PASSWORD` env vars missing |
| 9 | REST CORS open to all origins | Restricted to `process.env.CLIENT_URL` |
| 10 | `.trimLeft()` deprecated | Changed to `.trimStart()` |
| 11 | `expiryDate.toISOString()` crash on null | Added optional chaining with `'N/A'` fallback |
| 12 | MongoDB transactions on standalone instance | Replaced with 3-phase compensation pattern (validate → write → compensate) |
| 13 | `profile.name` doesn't exist on AuthProfile | Changed to `profile.full_name` |
| 14 | Active shops counted from ShopInventory (wrong) | Changed to `Shop.countDocuments({ isActive: true, isOnline: true })` |

---

## 8. Known Limitations & Current State

1. **No replica set** — MongoDB transactions replaced with compensation pattern. Works correctly but not atomic (tiny window for inconsistency under extreme load).
2. **Token expiry not handled** — JWT expires in 1 day but frontend doesn't detect 401 and re-route to login.
3. **No refresh token** — Once JWT expires, user must log in again manually.
4. **`beforeunload` + keepalive** — Works in most browsers but not 100% reliable on mobile.
5. **No rate limiting** — All API endpoints are unprotected from brute force / abuse.
6. **No input sanitization** — mongoose-sanitize or express-validator not applied globally.
7. **Polling-heavy frontend** — Many components poll every 3–5s instead of relying purely on Socket.io, which wastes bandwidth.
8. **No pagination UI** — Backend supports pagination but frontend loads all records in most views.
9. **PDF invoice** — Basic jsPDF implementation; not printer-optimized.
10. **No multi-tab session sync** — Two browser tabs of the same shop user don't share state.

---

## 9. Performance Roadmap

### Phase 1 — Quick Wins (1–2 weeks)

#### 1.1 Handle JWT expiry gracefully
Add a global Axios/fetch interceptor that catches 401 responses and redirects to `/auth`:
```js
// In a global fetchWrapper utility
if (response.status === 401) {
  localStorage.clear();
  window.location.href = '/auth';
}
```

#### 1.2 Add rate limiting
Install `express-rate-limit` and apply to auth routes:
```js
import rateLimit from 'express-rate-limit';
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use('/api/auth', authLimiter);
```

#### 1.3 Replace polling with Socket.io events
Currently, many components poll every 3–5s. Instead:
- Admin dashboard listens to `dispatchUpdate` / `shopStatusChange` socket events
- Shop dashboard listens to `inventoryUpdated` / `dispatchUpdate`
- Remove `refetchInterval` from queries and only refetch on socket event

#### 1.4 Add MongoDB indexes for common queries
```js
// In Batch model
batchSchema.index({ medicineId: 1, stock: 1 });

// In Sale model  
saleSchema.index({ shopId: 1, createdAt: -1, status: 1 });

// In Dispatch model
dispatchSchema.index({ shopId: 1, status: 1 });
dispatchSchema.index({ status: 1, confirmedAt: -1 });
```

#### 1.5 Validate inputs with Zod on the backend
```js
import { z } from 'zod';
const checkoutSchema = z.object({
  items: z.array(z.object({ batch_id: z.string(), qty: z.number().positive() })),
  total: z.number().positive(),
});
// Use in controller: checkoutSchema.parse(req.body)
```

---

### Phase 2 — Architecture (1 month)

#### 2.1 Convert MongoDB to Replica Set
This enables true ACID transactions (removing the compensation pattern):
```bash
# mongod.conf
replication:
  replSetName: "rs0"

# In mongo shell
rs.initiate()
```
Then restore `mongoose.startSession()` + `session.startTransaction()` in controllers.

#### 2.2 Add Refresh Tokens
- Store a `refreshToken` (long-lived, 30d) in an httpOnly cookie on login
- Short-lived JWT (15 min) in memory / localStorage
- `POST /api/auth/refresh` endpoint to issue new JWT from refresh token

#### 2.3 Add Redis for caching + session store
Cache expensive aggregations:
```js
import Redis from 'ioredis';
const redis = new Redis(process.env.REDIS_URL);

// In getAnalyticsStats:
const cacheKey = `analytics:${adminId}`;
const cached = await redis.get(cacheKey);
if (cached) return res.json(JSON.parse(cached));
// ...compute...
await redis.setex(cacheKey, 60, JSON.stringify(result)); // 60s TTL
```

#### 2.4 Implement pagination UI
Add `page` / `limit` controls to:
- Admin inventory batches table
- Recent dispatches table  
- Sales receipts table
- All shops list

#### 2.5 Add `.env` validation on startup
```js
import { z } from 'zod';
const EnvSchema = z.object({
  MONGODB_URI: z.string().url(),
  JWT_SECRET: z.string().min(32),
  ADMIN_EMAIL: z.string().email(),
  ADMIN_PASSWORD: z.string().min(8),
  CLIENT_URL: z.string().url(),
});
EnvSchema.parse(process.env); // Throw on startup if missing
```

#### 2.6 Add Helmet.js for HTTP security headers
```js
import helmet from 'helmet';
app.use(helmet());
```

#### 2.7 Centralize API calls in the frontend
Create a `src/lib/api.ts` with typed fetch wrappers instead of raw `fetch()` calls scattered across 15+ component files:
```ts
export const api = {
  inventory: {
    getAll: () => apiFetch<Batch[]>('/inventory'),
    addBatch: (data: AddBatchPayload) => apiFetch('/inventory', { method: 'POST', body: data }),
  },
  dispatch: {
    create: (data: CreateDispatchPayload) => apiFetch('/dispatch', { method: 'POST', body: data }),
  },
  // ...
};
```

---

### Phase 3 — Scale (2–3 months)

#### 3.1 Add proper logging with Winston
```js
import winston from 'winston';
const logger = winston.createLogger({
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});
```
Replace all `console.log` / `console.error` with `logger.info` / `logger.error`.

#### 3.2 Add automated tests

**Backend (Jest + Supertest):**
```
tests/
├── auth.test.js        # Login, register, logout
├── inventory.test.js   # Add medicine, add batch, stats
├── dispatch.test.js    # Create, accept, reject dispatch
└── pos.test.js         # Checkout, refund
```

**Frontend (Vitest + Testing Library):**
```
src/__tests__/
├── auth.test.tsx
├── AdminDashboard.test.tsx
└── POSCheckout.test.tsx
```

#### 3.3 Add CI/CD pipeline (GitHub Actions)
```yaml
# .github/workflows/ci.yml
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci && npm test
  lint:
    runs-on: ubuntu-latest
    steps:
      - run: npm run lint
```

#### 3.4 Docker containerization
```dockerfile
# backend/Dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY . .
CMD ["node", "server.js"]
```
```yaml
# docker-compose.yml
services:
  mongo:
    image: mongo:7
    command: --replSet rs0
  backend:
    build: ./backend
    env_file: ./backend/.env
    depends_on: [mongo]
  frontend:
    build: ./frontend
    depends_on: [backend]
```

#### 3.5 Add Cloudflare / CDN for frontend static assets
- Deploy frontend build to Cloudflare Pages
- Use `wrangler.jsonc` (already present in project) for Cloudflare Workers deployment
- All static assets served from edge — reduces latency globally

#### 3.6 Add proper error monitoring (Sentry)
```js
import * as Sentry from '@sentry/node';
Sentry.init({ dsn: process.env.SENTRY_DSN });
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.errorHandler());
```

#### 3.7 Database query optimization
- Use `.lean()` on all read-only Mongoose queries (already partially done)
- Add compound indexes for analytics aggregations
- Use MongoDB aggregation pipeline projections to return only needed fields
- Consider read replicas for analytics queries

#### 3.8 Add multi-tab session sync
Use `localStorage` event listener to sync auth state across tabs:
```ts
window.addEventListener('storage', (e) => {
  if (e.key === 'user' && !e.newValue) {
    // Another tab logged out — sync this tab
    setUser(null); setRole(null);
    window.location.href = '/';
  }
});
```

---

## 10. Environment Variables

### Backend (`backend/.env`)
```env
# Required
MONGODB_URI=mongodb://127.0.0.1:27017/kk_pharma
JWT_SECRET=<at least 32 random characters>
ADMIN_EMAIL=your-admin@email.com
ADMIN_PASSWORD=YourStrongPassword123!

# Optional
PORT=5000
CLIENT_URL=http://localhost:8081
NODE_ENV=development
SENTRY_DSN=                        # Phase 3
REDIS_URL=redis://localhost:6379   # Phase 2
```

### Frontend (`frontend/.env`)
```env
VITE_API_URL=http://localhost:5000
```

---

## 11. Running the Project

### Prerequisites
- Node.js 18+
- MongoDB 6+ running locally (or Atlas connection string)

### Start MongoDB (local)
```bash
mongod --dbpath /data/db
```

### Start Backend
```bash
cd lord/backend
npm install
npm run dev        # nodemon server.js on port 5000
```

### Start Frontend
```bash
cd lord/frontend
npm install
npm run dev        # Vite on port 8081
```

### First-time Setup
The server automatically calls `ensureAdminAccount()` on startup — no manual seeding needed as long as `ADMIN_EMAIL` and `ADMIN_PASSWORD` are set in `.env`.

---

## Quick Reference: Data Flow Summary

```
Admin                          Backend                         Shop User
  │                               │                               │
  │── Add Medicine ──────────────►│ POST /inventory/medicines     │
  │── Add Batch ─────────────────►│ POST /inventory               │
  │── Create Dispatch ───────────►│ POST /dispatch                │
  │── Mark In-Transit ───────────►│ PATCH /dispatch/admin/:id     │
  │                               │──── Socket: dispatchUpdate ──►│
  │                               │                               │── Accept ──►│
  │                               │◄── PATCH /dispatch/shop/:id   │
  │                               │ Deduct warehouse stock         │
  │                               │ Add to shop inventory          │
  │                               │──── Socket: inventoryUpdated ─►│
  │                               │                               │── Sell ────►│
  │                               │◄── POST /pos/checkout          │
  │                               │ Deduct shop inventory          │
  │                               │ Create Sale + PDF receipt      │
  │◄── Analytics ─────────────────│ GET /reports/analytics         │
  │    Revenue / Cost / Net       │                               │
```

---

*Generated for KK Pharma project — Last updated: May 2026*
*Stack: Node.js + Express + MongoDB + React + TanStack Router + Socket.io*
