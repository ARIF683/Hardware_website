# Stock Manager — Hardware & Billing Hub

React + Vite + TypeScript web dashboard sharing a live Supabase database with the Android companion app. Features inventory tracking, atomic stock updates, invoice billing, quotations, customer/supplier ledger khata, daily cashflow, color-machine tint report parsing, and announcement/festival banners.

## Prerequisites

- Node.js 20+ (tested on Node 22)
- npm
- A Supabase project configured with Row Level Security (RLS), `adjust_stock` RPC, and the `sign-cloudinary-upload` Edge Function

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create a `.env` file (or `.env.local`) from `.env.example`:

```bash
cp .env.example .env
```

Fill in:

- `VITE_SUPABASE_URL` — your Supabase project URL (`https://<project-ref>.supabase.co`)
- `VITE_SUPABASE_ANON_KEY` — your Supabase publishable/anon key

3. Start the development server on port 3000:

```bash
npm run dev
```

## Available Scripts

- `npm run dev` — start Vite dev server (`0.0.0.0:3000`)
- `npm run lint` — run TypeScript type checking (`tsc --noEmit`)
- `npm test` — compile and run unit tests via `node --test`
- `npm run build` — build production bundle into `dist/`

## Required Supabase Setup (Manual Dashboard Steps)

1. **Row Level Security (RLS)**: Restrict `items`, `stock_transactions`, `daily_cashflow`, `quotations`, `ledger_accounts`, `ledger_entries`, `purchases`, and `app_users` to `authenticated` users, and restrict admin/role writes on `app_users` and store-wide clear/profile writes to admin accounts.
2. **Atomic Stock RPC (`adjust_stock`)**: Deploy `public.adjust_stock(p_item_id text, p_delta numeric)` in SQL Editor so concurrent stock changes from web and mobile never overwrite each other.
3. **Cloudinary Signing Edge Function**: Verify the caller's user JWT via `supabase.auth.getUser(token)` inside `sign-cloudinary-upload`, restrict uploads to the `items` folder, and enforce file size/type limits.
4. **Auth Hardening**: Enable Supabase Auth rate limiting, Cloudflare Turnstile / CAPTCHA, and a minimum password length of 8+ characters.
