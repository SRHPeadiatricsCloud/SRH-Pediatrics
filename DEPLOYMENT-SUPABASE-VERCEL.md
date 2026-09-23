# Deploying SRH Pediatrics with Supabase + Vercel

This project is ready to be uploaded to GitHub and deployed with a real Postgres database from Supabase.

## 1) Upload to GitHub
- Unzip the project archive locally.
- Create a new GitHub repository.
- Upload or push the extracted files.
- Do **not** commit `node_modules`, `.next`, or `.env`.

## 2) Create the Supabase database
1. Create a new Supabase project.
2. Open **SQL Editor**.
3. Run the SQL from `supabase/schema.sql`.

This creates the tables used by the app:
- babies
- problems
- vitals
- events
- tasks
- handovers
- keymasters
- learning_items
- recent_updates
- roster
- oncall

## 3) Get the database connection string
From Supabase, copy the **Transaction Pooler** or pooled Postgres URI.

Recommended format:

```env
DATABASE_URL=postgresql://postgres:[PASSWORD]@[HOST]:6543/postgres?sslmode=require
```

## 4) Import into Vercel
1. Go to Vercel.
2. Import the GitHub repository.
3. Framework preset: **Next.js**.
4. Add environment variable:
   - `DATABASE_URL` = your Supabase Postgres connection string
5. Deploy.

## 5) Seed demo data (optional)
After deployment, seed the app by sending a POST request to:

```bash
curl -X POST https://YOUR-VERCEL-APP.vercel.app/api/seed
```

Expected response:

```json
{"ok":true,"count":9}
```

## Notes
- The app uses real `pg` when `DATABASE_URL` is present.
- Without `DATABASE_URL`, it falls back to an in-memory local/dev database only.
- For public production use, **use Supabase/Postgres**.
- The public static bilirubin page is available from `docs/index.html`, but the full app should be deployed through Vercel.

## Troubleshooting: production keeps showing an old UI

The app ships a PWA service worker (`public/sw.js`) so the board works offline. If a device keeps
showing a previous build after a deploy:

1. **Cause (fixed in 3.1.0).** The worker served React router (RSC) payloads and other non-hashed
   assets cache-first, and its `VERSION` string never changed — so old caches survived every deploy
   and replayed the previous build's React tree, even though Vercel had deployed the new code.
2. **What 3.1.0 changed.** Router/RSC payloads are network-only, documents are network-first (the
   cached copy is used only when offline), only immutable `/_next/static/*` stays cache-first,
   `/sw.js` is served `max-age=0, must-revalidate`, and the client activates a new worker
   immediately instead of waiting for every tab to close.
3. **A device that is still stuck self-heals** on the next visit: on activate the worker deletes
   every cache whose name does not match the current `VERSION`. To force it sooner, open DevTools →
   Application → Service Workers → **Unregister** and reload, or run this in the console and reload:

   ```js
   navigator.serviceWorker.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
   ```

4. **Confirm what production is actually serving.** Run the **Production UI verify** workflow
   (`gh workflow run prod-ui-verify.yml`, or Actions → Production UI verify → Run workflow). It is
   read-only — it never calls `/api/seed`, which truncates every clinical table — and it reports
   `/api/health`, the served `/sw.js` version and cache headers, the build marker in the served
   document, and whether `+ Advance feeds` is present in the deployed JS bundle.

## Key files
- `src/db/index.ts` — database connection logic
- `src/db/schema.ts` — typed schema definitions
- `supabase/schema.sql` — SQL to create tables in Supabase
- `src/app/api/seed/route.ts` — optional demo seed route
- `src/components/phototherapy-calculator.tsx` — interactive bilirubin calculator UI
- `src/lib/phototherapy.ts` — bilirubin chart data and logic
