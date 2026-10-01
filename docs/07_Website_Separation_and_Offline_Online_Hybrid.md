# Website Separation and Offline/Online Hybrid Architecture

## Status

Accepted and implemented.

Separation date: 2026-10-01. The repository separation is implemented; the synchronization bridge described below is future work.

## Repository Separation

LabFlow and the public website are now maintained as independent applications.

### Local LabFlow Software

Repository:

`zaighaumrana/lab-software`

This repository contains the operational laboratory system:

- staff application
- NestJS API
- PostgreSQL / Prisma database
- patients
- bookings
- billing and payments
- sample workflow
- result entry and release
- report generation and printing
- doctors
- notifications
- cash shifts
- analytics
- settings and administration

The local application must remain capable of operating without internet access.

### Public Website

Repository:

`zaighaumrana/labwebsitedemo`

The public website was extracted from the LabFlow monorepo on 2026-10-01.

Website development is currently paused while the local LabFlow application is stabilized.

The website must not directly access:

- the local PostgreSQL database
- the local NestJS API
- the laboratory LAN
- the local filesystem
- locally stored report files

## Legacy Snapshot

The original combined software and website implementation is preserved in:

- `lab-software/main`
- tag `legacy-combined-2026-10-01`

This snapshot is historical and must not be used for new product development.

Active LabFlow development occurs on `development`, the software-only separated codebase. `main` remains the frozen legacy snapshot.

## Target Online Architecture

The future architecture is:

```text
Public Website
      |
      v
Online Shared Database / Service
      ^
      |
Sync / Bridge Agent
      |
      v
Local LabFlow Database / API
```

The local database remains the source of truth for operational laboratory work. Future local-to-online synchronization may publish approved report, tracking, readiness, and result metadata. Future online-to-local synchronization may retrieve booking requests and related website-originated records for local review and processing.

The sync / bridge agent is future work and is **not being implemented now**. It must eventually support retries, idempotency, intermittent connectivity, auditability, conflict handling, and recovery. The existing synchronization outbox is retained as an architectural foundation, not a completed bridge.

## Current Priority and Boundary

The current priority is stabilizing the local LabFlow application while preserving its operational functionality and offline operation.

No future feature may recreate a direct website-to-local-API or website-to-local-database dependency. Online functionality must use the shared online service and future bridge while respecting the access restrictions above.
