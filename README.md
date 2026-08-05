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

Prisma doesn't create the database or role for you — do this once, before `pnpm db:migrate`.

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

Once the database and user exist, Prisma takes over from there:
```powershell
pnpm db:generate   # generates the Prisma client from schema.prisma
pnpm db:migrate    # creates all tables inside the new database
pnpm db:seed       # (optional) loads sample tests/parameters for local dev
```

## Quick Start (Development)

```bash
# Install dependencies
pnpm install

# Configure database
cp packages/database/.env.example packages/database/.env
# Edit DATABASE_URL as needed — see "Database Setup" above to create the DB first

# Generate Prisma client & run migrations
pnpm db:generate
pnpm db:migrate

# Start each app (run each in its own terminal — they run at the same time)
pnpm dev:api       # NestJS API      → http://localhost:3000
pnpm dev:web       # Internal LMS UI → http://localhost:5173
pnpm dev:website   # Public website  → http://localhost:3001
```

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

**Reset the database from scratch**
```powershell
pnpm db:migrate
pnpm db:seed
```

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
