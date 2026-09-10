# SRH Pediatrics — Security and Access Runbook

This document covers hardening the production stack: GitHub repository
visibility, Supabase database lock-down, and credential rotation.

The app's only sanctioned path to the database is the Next.js server
(Vercel) using `DATABASE_URL`. Nothing in the browser talks to Supabase
directly — no anon key is shipped — so every other access path can and
should be closed.

---

## 1. GitHub repository

Make the repository private (requires an **admin** on the
`SRHPeadiatricsCloud` org):

```bash
gh repo edit SRHPeadiatricsCloud/SRH-Pediatrics --visibility private --accept-visibility-change-consequences
```

> Older `gh` versions (< 2.53) don't have the consent flag; use the API
> instead: `gh api -X PATCH repos/SRHPeadiatricsCloud/SRH-Pediatrics -f visibility=private`

Vercel deploys through the **Vercel GitHub App**, which retains access to
private repositories — deployments continue to work after the change.
Verify by pushing any commit to `main` and confirming a new Production
deployment appears in the Vercel dashboard (or via
`gh api repos/SRHPeadiatricsCloud/SRH-Pediatrics/deployments`).

Consequences of going private: stars/watchers are cleared, forks are
detached, and GitHub Pages (if any) stops serving. The static pages in
`docs/` (`index.html`, `abg-vbg.html`) will no longer be reachable via
GitHub Pages; the Vercel app itself is unaffected.

## 2. Application-level access

- Reads are public (ward board is view-only without sign-in).
- All mutating API routes require `x-editor` / `x-code` headers checked
  against the **keymasters** table (`src/lib/guard.ts`). Codes are stored
  hashed.
- Remove departed staff from the Keymaster List promptly (Keymasters page,
  signed in as a consultant).

## 3. Supabase lock-down (SQL Editor)

Run the following in the Supabase **SQL Editor**. It revokes all access
from the auto-generated API roles (`anon`, `authenticated`) and enables
Row Level Security on every table with **no policies**, which means
"deny by default" for any role that does not bypass RLS. The app itself
connects as `postgres` via `DATABASE_URL` and is unaffected.

```sql
-- 3.1 Revoke PostgREST/API roles: nothing in this app uses the Supabase
--     Data API, so anon/authenticated should have zero access.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke all on all functions in schema public from anon, authenticated;
revoke usage on schema public from anon, authenticated;

-- Make sure future tables don't silently regain grants.
alter default privileges in schema public revoke all on tables    from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
alter default privileges in schema public revoke all on functions from anon, authenticated;

-- 3.2 Enable RLS on every app table (deny-by-default: no policies created).
alter table public.babies          enable row level security;
alter table public.problems       enable row level security;
alter table public.vitals         enable row level security;
alter table public.events         enable row level security;
alter table public.tasks          enable row level security;
alter table public.handovers      enable row level security;
alter table public.keymasters     enable row level security;
alter table public.learning_items enable row level security;
alter table public.recent_updates enable row level security;
alter table public.roster         enable row level security;
alter table public.oncall         enable row level security;
```

Verification queries:

```sql
-- All rows should show rowsecurity = true
select tablename, rowsecurity from pg_tables where schemaname = 'public';

-- Should return no rows (no remaining grants to API roles)
select grantee, table_name, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated');
```

## 4. Rotate the database password

1. Supabase Dashboard → **Project Settings → Database → Reset database
   password**. Generate and copy the new password.
2. Rebuild the pooled connection string
   (`postgresql://postgres.[project-ref]:[NEW-PASSWORD]@[pooler-host]:6543/postgres?sslmode=require`).
3. Vercel Dashboard → Project → **Settings → Environment Variables** →
   edit `DATABASE_URL` for **Production** (and Preview if set) with the
   new string.
4. **Redeploy** the latest Production deployment (env changes only apply
   to new deployments).
5. Verify: `GET /api/health` → `{"ok":true}` and the ward board loads
   with data. If health fails, the old string is still deployed or the
   password/host is wrong.

Rotate immediately if the connection string was ever pasted into chat,
a commit, a screenshot, or a public repo.

## 5. Standing rules

- Never commit `.env`, connection strings, or employee codes.
- `DATABASE_URL` lives only in Vercel env vars and local `.env` files.
- Local development without `DATABASE_URL` uses the in-memory pg-mem
  fallback (`src/db/index.ts`) — no credentials needed for dev.
