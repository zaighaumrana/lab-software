# Website Separation and Offline/Online Hybrid Architecture

## Status

Accepted and implemented.

Decision date: 2026-10-01.

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

Active LabFlow development begins from the software-only separated codebase.

## Target Online Architecture

The future architecture is:

```text
Public Website
      |
      v
Online Shared Database / Service
      ^
      |
      |
Sync / Bridge Agent
      |
      v
Local LabFlow Database / API