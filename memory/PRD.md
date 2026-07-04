# Venkat Ramana Pickles — PRD

## Overview
Takeaway (pickup) mobile app for artisanal Indian pickles with 4 roles: Admin, Primary Seller, Sub-Seller, Customer. Pay-at-store only (no online payments in MVP). Built with Expo (React Native) + Supabase (Auth + Postgres) + FastAPI (analytics/checkout aggregation).

## Roles
- **Customer**: browses curated home, discovers stores, adds items to a multi-store cart, places pickup order, tracks status.
- **Primary Seller**: manages one store — adds/edits pickles, packaging & prices, processes orders, sees analytics; can be assigned up to 50 sub-sellers.
- **Sub-Seller**: processes orders for the assigned store (view products, cannot add).
- **Admin**: creates stores, assigns primary sellers, promotes users, curates homepage sections, views platform analytics.

## Key Flows
- Multi-store cart is auto-split into per-store orders on checkout (FastAPI backend using service_role).
- Order lifecycle: `placed → accepted → ready_date_set → ready_for_takeaway → completed` (+ `cancelled`).
- Home sections (Top Sellers, Featured, New Arrivals) fully editable by admin — chip toggles on the Curation screen.

## Integrations
- **Supabase**: Auth (email/password), Postgres with RLS policies, service_role used only on backend for privileged ops.
- **FastAPI backend**: JWT verification via `/auth/v1/user`, endpoints for checkout, admin promote, per-store & admin analytics.

## Setup step (one-time)
The Supabase schema/RLS/triggers/seed live in `/app/supabase_schema.sql`. Client must run this SQL once in the Supabase SQL editor, then sign up their first user and promote them to admin with:
```sql
update public.user_profiles set role = 'admin' where full_name = '<your email or name>';
```

## Business Enhancements
- **Analytics** already surface top-selling pickles, revenue & status funnel per store — enabling data-driven catalog decisions for each store owner.
- **Curated homepage sections** function as merchandising slots, giving Venkat Ramana leverage to run promotions or push new arrivals without a code change.
