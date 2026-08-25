# Laboratory Management System (LMS)

Offline-first Laboratory Management System + public website.

**Status:** Implementation in progress  
**Authoritative design docs:** See `/docs` (copied from the Architecture Handbook)

## Stack

| Layer | Technology |
|-------|------------|
| Backend | NestJS + TypeScript + Prisma |
| Database | PostgreSQL 16 |
| Internal UI | React + Vite + TypeScript + Tailwind + shadcn/ui |
| Public Website | Next.js + TypeScript + Tailwind |
| PDF | Puppeteer |
| Monorepo | pnpm workspaces |

## Repository Structure

```
lms/
├── apps/
│   ├── api/          # NestJS backend (local server)
│   ├── web/          # Internal LMS (staff workstations)
│   └── website/      # Public-facing site
├── packages/
│   ├── database/     # Prisma schema + client
│   ├── shared/       # Shared types, constants, validators
│   └── ui/           # Shared UI primitives (future)
├── docs/             # Architecture handbook
└── scripts/          # Deployment & maintenance scripts
```

## Requirements (what needs to be on the computer)

Install these before running `setup.ps1` or `pnpm install`:

| Software | Version | Why | Download |
|----------|---------|-----|----------|
| Node.js | 20 LTS or newer | Runs the API, web app, and website | https://nodejs.org |
| pnpm | 9+ (installed via `npm install -g pnpm` if missing) | Monorepo package manager | installed by `setup.ps1` automatically |
| PostgreSQL | 16 | Database | https://www.postgresql.org/download/windows/ |
| Git | any recent version | Version control | https://git-scm.com |

Optional but recommended:
- **pgAdmin** (bundled with the PostgreSQL installer) — GUI for inspecting the database.
- **VS Code** — editor, for anyone maintaining the code.

## Database Setup (create the Postgres DB & user)

Prisma doesn't create the database or role for you — do this once per machine, before generating/applying migrations.

**Option 1 — using `psql` (Windows/PowerShell, macOS, Linux — same commands)**

```powershell
# Open a psql session as the default postgres superuser
psql -U postgres
```

Then, inside the `psql` prompt:
```sql
CREATE USER lms WITH PASSWORD 'lms';
CREATE DATABASE lms OWNER lms;
GRANT ALL PRIVILEGES ON DATABASE lms TO lms;
\q
```

**Option 2 — one-liners without opening an interactive session (PowerShell)**
```powershell
psql -U postgres -c "CREATE USER lms WITH PASSWORD 'lms';"
psql -U postgres -c "CREATE DATABASE lms OWNER lms;"
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE lms TO lms;"
```

**Option 3 — pgAdmin (GUI)**
Right-click **Login/Group Roles → Create → Login/Group Role** (name `lms`, set a password on the Definition tab, enable Login on Privileges), then right-click **Databases → Create → Database** (name `lms`, Owner `lms`).

This must match `packages/database/.env` exactly:
```
DATABASE_URL="postgresql://lms:lms@localhost:5432/lms?schema=public"
#                          ^user ^password  ^host  ^port ^database name
```

If you're setting this up for a different client/environment, just swap the user, password, and database name consistently in both the `CREATE` commands above and the `DATABASE_URL` — they don't have to be `lms`/`lms`/`lms`.

## Prisma Migration Workflow

**Migration history lives in `packages/database/prisma/migrations/` and is committed to git.** It is not gitignored, and it should never be gitignored — a fresh `git clone` must be able to recreate the schema from that folder alone, without anyone having to reverse-engineer it from `schema.prisma`. If you find that folder missing or out of date after pulling changes, that's a bug in how the change was committed, not something to route around with `migrate reset`.

**Rule of thumb: only the person who changed `schema.prisma` generates the migration, and it gets committed in the same change as the schema edit.** Everyone else just applies migrations that already exist — they never need to generate anything.

### Scenario A — first-time setup, no migration history exists yet

This only applies the very first time the project's database schema is established (`packages/database/prisma/migrations/` is empty or absent):

```powershell
pnpm install
cp packages/database/.env.example packages/database/.env   # then edit DATABASE_URL
pnpm db:generate

pnpm --filter @lms/database exec prisma migrate dev --name init
```

That command does three things in one step: creates the initial migration file from `schema.prisma`, applies it to your database (creating every table), and regenerates the Prisma Client. Commit the resulting `packages/database/prisma/migrations/` folder — this is the step that was missing before, which is what caused `tenants` and every other table to not exist after a reset.

### Scenario B — normal day-to-day workflow (migration history already exists)

This is what you use for everything after that first `--name init` — pulling someone else's changes, or making your own:

```powershell
pnpm db:migrate
```

This wraps `prisma migrate dev` (see `package.json`). Two cases:
- **You pulled a change that already includes new migration files** — this just applies them. Nothing to name, nothing to generate.
- **You edited `schema.prisma` yourself** — Prisma detects the drift and prompts you to name the new migration, then generates and applies it. Commit the new folder it creates under `prisma/migrations/` along with your schema change.

### Applying migrations in a non-interactive/production context

```powershell
pnpm --filter @lms/database exec prisma migrate deploy
```
`migrate deploy` only applies existing committed migrations — it never generates new ones and never prompts. This is what an installer or CI should run, never `migrate dev`.

### ⚠️ About `prisma migrate reset`

**Do not use this as a routine response to schema changes or migration errors.** It drops every table and all data, then reapplies migration history from scratch. The only legitimate reasons to run it:
- You're on a throwaway local dev database and specifically want to wipe it and start clean.
- Your migration history is genuinely corrupted beyond repair and you've accepted the data loss.

If you're hitting an error like `relation "..." does not exist` or `table ... does not exist`, that almost always means migration history is missing or out of sync with the schema — the fix is Scenario A or B above (generate/apply the missing migration), **not** reset. Reset destroys real data if anyone has been using the app; treat it as a last resort, not a default troubleshooting step.

### Seeding

```powershell
pnpm db:seed
```
Loads sample tests, parameters, and reference ranges (see `packages/database/prisma/seed.ts`). Safe to re-run — it upserts rather than duplicating. Run this after migrations are applied (Scenario A or B above), any time you want the sample catalog data present.

## Quick Start (Development)

```powershell
# 1. Install dependencies
pnpm install

# 2. Configure database connection
cp packages/database/.env.example packages/database/.env
# edit DATABASE_URL — see "Database Setup" above to create the DB first

# 3. Generate the Prisma Client
pnpm db:generate

# 4. Apply migrations
#    - No migrations/ folder yet? → see "Prisma Migration Workflow" Scenario A
#    - Migrations already exist?  → see Scenario B
pnpm db:migrate

# 5. (optional) seed sample catalog data
pnpm db:seed

# 6. Start each app (run each in its own terminal — they run at the same time)
pnpm dev:api       # NestJS API      → http://localhost:3000
pnpm dev:web       # Internal LMS UI → http://localhost:5173
pnpm dev:website   # Public website  → http://localhost:3001
```

## Running Tests

```powershell
pnpm --filter @lms/api test
```

No database or running server needed — see `docs/13_Testing.md` for what this suite actually covers (and doesn't), and for the pattern to follow when adding a test for a new controller or permission.

## Troubleshooting (Windows / PowerShell)

Common issues on a fresh Windows machine, and the PowerShell commands to diagnose/fix them.

**"running scripts is disabled on this system" when running `setup.ps1` or `pnpm`**
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

**Check what's installed / on PATH**
```powershell
node -v
pnpm -v
git --version
psql --version
```

**`node`/`pnpm`/`psql` not recognized after installing**
Close and reopen PowerShell (PATH is only refreshed in new sessions), or check PATH directly:
```powershell
$env:Path -split ';' | Select-String -Pattern 'node|pnpm|postgres'
```

**Is PostgreSQL running?**
```powershell
Get-Service -Name postgresql*
# If stopped:
Start-Service -Name postgresql-x64-16
```

**What's using a port (e.g. API on 3000, web on 5173, website on 3001, Postgres on 5432)?**
```powershell
Get-NetTCPConnection -LocalPort 3000 | Select-Object -Property OwningProcess
Get-Process -Id <OwningProcess>
# To kill it:
Stop-Process -Id <OwningProcess> -Force
```

**`pnpm install` fails partway / corrupted store**
```powershell
pnpm store prune
Remove-Item -Recurse -Force node_modules, apps\*\node_modules, packages\*\node_modules
pnpm install
```

**"relation/table does not exist" errors, or migrations look out of sync**
This means migration history is missing or behind, not that you need to reset. See "Prisma Migration Workflow" above — usually `pnpm db:migrate` (Scenario B) or, if `prisma/migrations/` is genuinely empty, `pnpm --filter @lms/database exec prisma migrate dev --name init` (Scenario A) is the fix. Only use `prisma migrate reset` if you intend to wipe the database on purpose.

**Check DATABASE_URL is actually being read**
```powershell
Get-Content packages\database\.env
```

## Design Principles (non-negotiable)

1. Offline is the default. Online is an enhancement.
2. Business logic lives in the backend only.
3. Results are never overwritten — amendments create new versions.
4. Every significant action is audited.
5. All external integrations sit behind interfaces.
6. Multi-tenant scaffolding exists from day one (invisible for this client).

## v1 Scope (confirmed)

- Patient registration + search
- Test/package catalog + simple pricing
- Walk-in booking → invoice → payment (Cash, Bank Transfer, EasyPaisa, JazzCash)
- Manual sample + result entry
- Report generation + printing
- SMS on registration and report-ready
- Simple dashboard + doctor commission tracking
- Public website (info pages + report lookup + online booking → review queue)

See the Architecture Handbook for full details.
