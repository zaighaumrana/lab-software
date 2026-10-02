# @lms/database

Prisma 7.10.0 schema, migrations and the supported database facade for LabFlow.
The API imports only `@lms/database`. Adapter creation, URL/schema selection and
the owned pg pool live in `src/client.ts`; public generated types/Decimal are
re-exported by `src/index.ts`. Internal package subpaths are blocked by exports.

## Commands

```bash
# From monorepo root
pnpm db:generate   # Generate ignored src/generated/prisma and compile dist
pnpm db:migrate    # Create + apply migration (dev)
pnpm db:studio     # Open Prisma Studio
pnpm --filter @lms/database validate
pnpm --filter @lms/database migrate:status # Read-only migration status
pnpm --filter @lms/database migrate:deploy # Apply reviewed migrations
pnpm --filter @lms/database test          # No database required
pnpm --filter @lms/database test:integration # Disposable LOCAL database only
```

Run `db:generate` after installing a fresh checkout and after every schema edit;
Prisma 7 migration commands no longer generate the client automatically. Then
run `pnpm -r build`. Seed is an explicit installation action, requires the
generated client, and compiles before execution. Do not seed operational data
to validate an ORM upgrade.

CLI and seed share `src/environment.ts`, loading this package's `.env` with
external environment variables taking precedence. Runtime uses Nest's existing
ConfigModule paths, then validates DATABASE_URL; it never loads a hidden env file
inside the client. Tests override the URL with a guarded disposable database.
The integration runner needs CREATE DATABASE privilege, applies the unchanged
migrations only there, exercises built API code, checks zero connections after
shutdown, then drops only its newly created test database. Build API/shared/web
before running that integration command.

The pinned Prisma 7.10.0 CLI automatically discovers `prisma7.config.ts` in this
package, including when invoked by the integration harness. Run CLI commands
through the workspace scripts/filter; no Prisma 8 config is present. The renamed
config is included in the tooling typecheck and a CLI-discovery regression test.

The long-running API has one global PrismaService, max 10 connections, a 5-second
connection/acquisition timeout, pg's 10-second idle timeout, and unchanged Prisma
transaction defaults. Local PostgreSQL queries require no cloud service. Bundle
database `dist` and the Prisma runtime/query compiler, adapter and pg dependencies
for deployment; generated TypeScript is not a substitute for built JavaScript.

See [the migration report](../../docs/Prisma_7_Migration_2026-10-02.md) for
verification, audit limitations, memory measurements and Prisma 8 migration readiness.

## Schema Notes

- Every operationally-scoped table carries `tenantId`.
- `branchId` is present where branch isolation is required.
- Results are versioned via `amendedFromResultId` — never overwritten.
- Audit log is append-only.
- Sync outbox is a foundation for future local-to-online synchronization; the online service and sync/bridge agent are not implemented yet (see Doc 07).
- State machine statuses are enforced in the application layer (NestJS domain services), not only by the database.
