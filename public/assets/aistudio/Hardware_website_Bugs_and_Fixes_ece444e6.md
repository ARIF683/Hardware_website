# Hardware\_website: Bugs and Fixes

Review of `Hardware_website-main.zip` (React + Vite + Supabase, shares one database with the Android app). The auth and data layers were read fully and the rest by search. Nothing was built or run, because dependencies could not be installed in the review environment, and the repo has no tests.

**How to use this document:** paste each task into AI Studio one at a time, in priority order. Tasks marked **MANUAL** need you to act in Supabase, Cloudinary or your hosting dashboard. Do not change anything not listed in a task.

## What looks fine

- No `dangerouslySetInnerHTML`, `innerHTML`, `eval` or `document.write` anywhere, so no XSS sinks were found. React escapes everything it renders.
- Row IDs in filters are URL-encoded and there is no raw SQL, so SQL injection is not the risk.
- The only key in the repo is the Supabase publishable (anon) key, which is meant to be public. No service\_role keys, passwords or keystores are committed.

## Task 1 (Critical, MANUAL): Row Level Security protects this site too

The anon key is hardcoded in `src/services/supabaseService.ts` (line 4) and in `.env.example`. Anyone can use it to call your REST API directly, so RLS is the only real protection for the shared database. The website also writes `app_users.is_admin` from the client, as the app does.

- Apply the RLS work from the app's AI Studio document (its Task 1) before anything else. It covers both the app and this site.
- **Test:** with only the anon key, requests to `items`, `ledger_accounts`, `ledger_entries`, `quotations`, `purchases` and `app_users` must return `[]` or an error. A non-admin user's token must not be able to write `is_admin: true` into `app_users`.
- After RLS is tightened, Task 8 (user token instead of anon key) becomes required, otherwise the site will stop loading data.

## Task 2 (Critical): Ignore forged realtime broadcasts

**File:** `src/services/supabaseService.ts`, functions `connectRealtime` and `broadcastChange`.

**Problem.** The WebSocket joins channels with only the anon key, and `onmessage` trusts any `broadcast` message. Anyone with the public anon key can connect and send a fake `db_change` event. That can change an item's price or stock on every open screen, or swap the store profile (including payment details) through `onStoreProfileChanged`.

**Change**

1. In `onmessage`, drop every message where `msg.event === "broadcast"` or `payload?.type === "broadcast"`. Accept only real `postgres_changes` events.
2. Delete `broadcastChange()` and every call to it. Postgres changes already reach other clients through realtime, and the call only produces unauthenticated events.
3. In the `phx_join` payload add `access_token: <the user's access token>` so postgres\_changes are delivered under the user's identity once RLS is enforced. Reconnect when the token refreshes.
4. Only update `onStoreProfileChanged` after re-fetching the profile row from `purchases` over REST, never from the pushed payload.

## Task 3 (High): Protect the Cloudinary signing function

**File:** `supabaseService.ts` (around line 550), the call to `/functions/v1/sign-cloudinary-upload`.

**Problem.** It is called with the anon key as the bearer token, so anyone can request signed upload parameters and upload to your Cloudinary account at your cost.

**Change**

1. Send the logged-in user's access token (`this.getActiveBearer()`) in `Authorization`, and keep the anon key only in `apikey`.
2. **MANUAL:** in the Edge Function, require a valid user JWT (`supabase.auth.getUser(token)`), restrict the folder to `items`, limit file size and upload type in the signed params, and add rate limiting.
3. If there is no user token, fail with a clear "please sign in" error instead of calling the function.

## Task 4 (High): Use UUIDs for every ID

**Files:** `src/context/StockContext.tsx` (lines about 946, 961, 1090, 1207, 1304, 1317, 1339, 1416, 1432, 1449, 1521, 1643).

**Problem.** IDs such as `entry_${Date.now()}`, `acc_${Date.now()}`, `quote_${Date.now()}` and `tx_${Date.now()}` collide when two records are made in the same millisecond (two devices on the shared database, or two lines created in one loop). Saves use `on_conflict=id` with `merge-duplicates`, so a collision silently overwrites another record and loses data.

**Change.** Export `generateUUID()` from `supabaseService.ts` and use it for all new IDs, keeping a readable prefix if needed:

```ts
export const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;
// before: id: `entry_${Date.now()}`
// after:  id: newId('entry')
```

Replace every `Date.now()`-based and `Math.random()`-based ID. Do not change existing stored IDs.

## Task 5 (High): Check every write and surface failures

**File:** `supabaseService.ts`.

**Problem.** Ten writes ignore the response, so 401, 403 and 500 errors look like successes: lines about 826, 926, 1022, 1078, 1139, 1175, 1188, 1200, 1212 and 1228 (transactions, cashflow, quotations, ledger accounts and entries, purchases, and the delete calls). The code then runs `broadcastChange` as if the save worked, and callers' `.catch()` handlers never fire, so users see "saved" while the database has nothing.

**Change.** Add a helper and use it for every write:

```ts
private async assertOk(resp: Response, action: string) {
  if (!resp.ok) {
    throw new Error(`${action} failed: ${resp.status} ${await resp.text()}`);
  }
  return resp;
}
// usage
const resp = await fetch(url, { method: 'POST', headers, body });
await this.assertOk(resp, 'Save cashflow');
```

Remove the `try/catch` that only logs a warning, so errors reach the callers. In `StockContext.tsx`, show a clear toast on failure and keep the record in a retry queue instead of dropping it.

## Task 6 (High): Atomic stock changes

**File:** `StockContext.tsx` (stock update near line 1195) and `supabaseService.ts` (`updateItemQty`).

**Problem.** The site sends an absolute quantity computed from local state. If the app and website both change the same item, the last write wins and stock becomes wrong.

**Change.** Add this RPC in Supabase (**MANUAL**: run it, and adjust column and id types to your schema), then call it with the change amount instead of the new total:

```sql
create or replace function public.adjust_stock(p_item_id text, p_delta numeric)
returns numeric language plpgsql security invoker as $$
declare new_qty numeric;
begin
  update public.items set qty = qty + p_delta
   where id = p_item_id and qty + p_delta >= 0
   returning qty into new_qty;
  if new_qty is null then raise exception 'insufficient stock or item not found'; end if;
  return new_qty;
end $$;
```

Call it through `POST /rest/v1/rpc/adjust_stock` with `{ p_item_id, p_delta }` (negative for stock out), then set local state from the returned quantity.

## Task 7 (Medium): Do not trust browser storage for roles and sessions

**File:** `src/services/authService.ts`.

**Problem.** The access token, refresh token, `hardware_auth_is_authed` and `hardware_auth_is_admin` are plain `localStorage` values, so any future XSS steals sessions, and anyone can set `is_admin` to `true` in DevTools to see admin screens (user management, announcements).

**Change**

1. On app load, validate the session by calling `/auth/v1/user` with the stored token, and set `isAuthed` and `isAdmin` only from that response (`app_metadata`) and from the `app_users` row, never from stored flags.
2. Treat the client-side admin flag as a display hint only. Admin actions must be enforced by RLS (Task 1).
3. Do not use `user_metadata` for roles. Only `app_metadata` is safe, and the code already uses that, so keep it.

## Task 8 (Medium): Stop falling back to the anon key

**Files:** `supabaseService.ts` (`getActiveBearer`, `fetchItems`) and `authService.ts` (`getSupabaseCredentials`).

**Problem.** With no user token the app silently uses the anon key as the bearer. `fetchItems` also retries with the default anon credentials after a 401 or 403 and overwrites the stored credentials. This mixes anonymous and signed-in access, and after RLS is tightened it only causes confusing failures.

**Change.** If there is no valid user token, stop and send the user to the login screen. Remove the 401/403 retry that falls back to `SUPABASE_URL`/`SUPABASE_KEY`, and never call `updateCredentials` automatically. On a 401, try one token refresh and then sign the user out.

## Task 9 (Medium): Clear cached data on logout

**File:** `authService.ts`, function `logout`, and the `hardware_*` keys written by `StockContext.tsx` (`saveLocal`).

**Problem.** Logout removes tokens but leaves items, transactions, ledger, quotations and the staff email list (`hardware_auth_registered_users`) in `localStorage`. The next person on a shared PC can read them.

**Change.** On logout, remove every key starting with `hardware_` except a small allow-list (for example the last signed-in email if you want to keep it), and reset the in-memory React state in `StockContext`.

## Task 10 (Medium): Remove the custom Supabase server setting

**Files:** `SettingsScreen.tsx` (lines about 89 to 153), `supabaseService.ts` (`updateCredentials`), `authService.ts` (`getSupabaseCredentials`).

**Problem.** Anyone can store a custom Supabase URL and key in `localStorage`. If a user is tricked into setting a malicious URL (or after an XSS), their email and password are sent to the attacker's host.

**Change.** Remove this setting from production builds, and always read the URL and key from `import.meta.env` only. If you must keep it for development, allow only HTTPS URLs ending in `.supabase.co` and require `import.meta.env.DEV`.

## Task 11 (Medium): Remove the base64 image fallback

**File:** `supabaseService.ts`, the image upload function (around lines 536 to 595).

**Problem.** If the Cloudinary upload fails, the compressed image is stored as a `data:` URL in the database. That bloats rows and slows every sync, on the site and in the app.

**Change.** Throw an error and let the form show "Image upload failed, please retry" instead of returning `compressedDataUrl`.

## Task 12 (Medium, MANUAL): Login rate limiting

The lockout counters (`hardware_auth_login_fails`, `hardware_auth_lock_until`) are in `localStorage` and reset when storage is cleared. Keep them as a courtesy, but in the Supabase dashboard turn on Auth rate limits and CAPTCHA (for example Cloudflare Turnstile) and require a minimum password length of 8 or more.

## Task 13 (Low): Dependencies and project hygiene

1. Remove unused packages from `package.json`: `express`, `dotenv`, `@google/genai`, `tsx`, `esbuild` (and the `overrides` block), and `GEMINI_API_KEY` from `.env.example`. If you add Gemini later, call it from a Supabase Edge Function, never from the browser bundle.
2. Commit `package-lock.json` for reproducible builds, and rename the package from `react-example`.
3. Add a `README.md` with setup steps (`.env`, `npm install`, `npm run dev`).
4. Add a GitHub Actions workflow that runs `npm ci`, `npm run lint` and `npm run build` on every push and pull request.
5. Add a few unit tests for `unitConversion.ts`, `formatters.ts` and `colorMachineParser.ts`.
6. Replace empty `catch {}` blocks with at least `console.warn`.

## Task 14 (Low, MANUAL): Security headers

Add these in your hosting config (Vercel `vercel.json`, Netlify `_headers`, or similar):

```
Content-Security-Policy: default-src 'self'; img-src 'self' data: https://res.cloudinary.com; connect-src 'self' https://xkjvcufajsyqbzjjllma.supabase.co wss://xkjvcufajsyqbzjjllma.supabase.co https://api.cloudinary.com; style-src 'self' 'unsafe-inline'; script-src 'self'; frame-ancestors 'none'; base-uri 'self'
X-Content-Type-Options: nosniff
Referrer-Policy: strict-origin-when-cross-origin
```

Test the site after adding the CSP, and loosen `img-src` or `connect-src` only for hosts you actually use.

## Task 15 (Low): Money and performance

- Bill totals use `parseFloat` and `Number` on rupee amounts (`BillScreen.tsx`, `StockContext.tsx`). Compute in whole paise (integers) and convert for display, to avoid rounding drift in GST totals.
- `public/` is 6.5 MB (an 880 KB `store_cover_banner.jpg` plus festival images). Convert the images to WebP, resize to the displayed size, and lazy-load festival images.

## Suggested order

1. Task 1 (RLS, shared with the app), then Tasks 2, 3, 5 and 4.
2. Tasks 6, 9 and 10, then Tasks 7, 8 and 11.
3. Tasks 12 to 15.

## Definition of done

- `npm run lint` and `npm run build` pass in CI.
- With only the anon key, REST calls to the data tables fail, and a non-admin cannot become admin.
- A forged `broadcast` message sent over the realtime WebSocket changes nothing on screen.
- A failed save shows an error and is retried, and never shows "saved".
- After logout, no `hardware_*` data remains in `localStorage`.
