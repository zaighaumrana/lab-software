# @lms/database

Prisma schema and client for the Laboratory Management System.

## Commands

```bash
# From monorepo root
pnpm db:generate   # Generate Prisma Client
pnpm db:migrate    # Create + apply migration (dev)
pnpm db:studio     # Open Prisma Studio
```

## Schema Notes

- Every operationally-scoped table carries `tenantId`.
- `branchId` is present where branch isolation is required.
- Results are versioned via `amendedFromResultId` — never overwritten.
- Audit log is append-only.
- Sync outbox implements the offline → website push pattern.
- State machine statuses are enforced in the application layer (NestJS domain services), not only by the database.
