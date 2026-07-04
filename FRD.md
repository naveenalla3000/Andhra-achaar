# Venkat Ramana Pickles — Functional Requirements Document (FRD)

## 1. Purpose
Enable a family-run pickles business to sell artisanal pickles across multiple stores through a takeaway (pickup) mobile app.

## 2. User Roles
| Role | Capabilities |
|---|---|
| Customer | Browse home sections, discover stores, view product detail, select packaging, add to cart (multi-store), checkout (pay-at-store), track orders |
| Sub-Seller | View store dashboard & orders, advance order status |
| Primary Seller | All sub-seller powers + add/edit pickles & packaging, manage sub-sellers |
| Admin | Create stores, assign primary sellers, promote users, curate homepage sections, view platform analytics |

## 3. Functional Requirements

### FR-1 Authentication
- Email/password sign-up & login via Supabase Auth.
- On first sign-up, a `user_profiles` row is created via database trigger with default role `customer`.
- Session persists across cold starts via AsyncStorage.

### FR-2 Store Management (Admin)
- Admin can create stores with name, address, lat/lng, opening & closing time.
- Admin can assign a primary seller and up to 50 sub-sellers per store (via Users screen).

### FR-3 Catalog (Primary Seller & Admin)
- Sellers add pickles: name, description, image URL, ingredients, active/hidden.
- Each pickle has one or more packaging options with label (e.g. "500g Jar") and price (₹).

### FR-4 Homepage Curation (Admin only)
- Sections seeded: Top Sellers, Featured, New Arrivals. Admin can create/delete more.
- Admin toggles which pickles appear in each section via chip UI.

### FR-5 Customer Ordering
- Home displays sections with product cards and a featured hero.
- Product detail shows packaging chips (radio-like selection) and quantity stepper.
- Cart groups items by store with per-store subtotal.
- Checkout auto-splits into one order per store; total is captured; payment mode is Pay-at-Store.

### FR-6 Order Lifecycle
Statuses: `placed → accepted → ready_date_set → ready_for_takeaway → completed`, plus `cancelled`.
- Seller taps "Accept", then "Set Ready Date", then "Mark Ready", then "Complete".
- Customer sees the current status and (once set) the ready date.

### FR-7 Analytics
- Per-store: total orders, active, completed, revenue, top 5 products by revenue, status breakdown.
- Admin: total stores, active stores, total orders, revenue, total customers, total sellers.

## 4. Non-Functional
- Mobile-first React Native (Expo SDK 54).
- Row-Level Security enforced on all customer-visible tables.
- Response times target <300 ms for read endpoints, <1 s for checkout.
- Passwords never leave Supabase Auth; app stores only session tokens (AsyncStorage).

## 5. Out of Scope (MVP)
- Online payments, delivery, refunds, ratings & reviews, real-time push notifications.
