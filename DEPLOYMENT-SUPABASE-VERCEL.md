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

## Key files
- `src/db/index.ts` — database connection logic
- `src/db/schema.ts` — typed schema definitions
- `supabase/schema.sql` — SQL to create tables in Supabase
- `src/app/api/seed/route.ts` — optional demo seed route
- `src/components/phototherapy-calculator.tsx` — interactive bilirubin calculator UI
- `src/lib/phototherapy.ts` — bilirubin chart data and logic
