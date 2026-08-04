# LMS Directory Tree — File Placement Guide

Use this as a checklist when copying downloaded files onto your Windows machine.

```
lms/
├── setup.ps1                          ← First-time setup script (run this)
├── package.json                       ← Root workspace config
├── pnpm-workspace.yaml                ← pnpm monorepo definition
├── .gitignore
├── README.md
├── DIRECTORY.md                       ← This file
│
├── docs/                              ← Architecture handbook (reference only)
│   ├── README.md
│   ├── 01_Product_Specification.md
│   ├── 02_Technical_Architecture.md
│   ├── 03_Core_Domain_Design.md
│   └── 04_Application_Modules.md
│
├── packages/
│   ├── database/                      ← Prisma schema + client + seed
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   ├── .env.example               ← Copy to .env and set DATABASE_URL
│   │   ├── README.md
│   │   ├── prisma/
│   │   │   ├── schema.prisma          ← Full database schema
│   │   │   └── seed.ts                ← Default tenant, users, tests, doctor
│   │   └── src/
│   │       └── index.ts               ← Re-exports PrismaClient
│   │
│   └── shared/                        ← Shared constants / roles
│       ├── package.json
│       ├── tsconfig.json
│       └── src/
│           └── index.ts
│
└── apps/
    └── api/                           ← NestJS backend (local server)
        ├── package.json
        ├── tsconfig.json
        ├── nest-cli.json
        └── src/
            ├── main.ts                ← Entry point
            ├── app.module.ts          ← Root module (imports all feature modules)
            │
            ├── common/
            │   ├── decorators/
            │   │   └── current-user.decorator.ts
            │   ├── guards/
            │   │   └── session.guard.ts
            │   └── prisma/
            │       ├── prisma.module.ts
            │       └── prisma.service.ts
            │
            └── modules/
                ├── auth/              ← Login / logout / session
                │   ├── auth.module.ts
                │   ├── auth.service.ts
                │   ├── auth.controller.ts
                │   └── dto/
                │       └── login.dto.ts
                │
                ├── patients/          ← Patient search + register
                │   ├── patients.module.ts
                │   ├── patients.service.ts
                │   ├── patients.controller.ts
                │   └── dto/
                │       ├── create-patient.dto.ts
                │       ├── update-patient.dto.ts
                │       └── search-patient.dto.ts
                │
                ├── bookings/          ← Walk-in / online / home-collection
                │   ├── bookings.module.ts
                │   ├── bookings.service.ts
                │   ├── bookings.controller.ts
                │   └── dto/
                │       ├── create-booking.dto.ts
                │       └── check-in-booking.dto.ts
                │
                ├── billing/           ← Invoice + payment
                │   ├── billing.module.ts
                │   ├── billing.service.ts
                │   ├── billing.controller.ts
                │   └── dto/
                │       ├── create-invoice.dto.ts
                │       └── record-payment.dto.ts
                │
                ├── laboratory/        ← Sample + result entry + amend
                │   ├── laboratory.module.ts
                │   ├── laboratory.service.ts
                │   ├── laboratory.controller.ts
                │   └── dto/
                │       ├── collect-sample.dto.ts
                │       ├── sample-action.dto.ts
                │       ├── enter-result.dto.ts
                │       └── amend-result.dto.ts
                │
                ├── reporting/         ← Report lookup
                │   ├── reporting.module.ts
                │   ├── reporting.service.ts
                │   └── reporting.controller.ts
                │
                ├── catalog/           ← Tests + packages admin
                │   ├── catalog.module.ts
                │   ├── catalog.service.ts
                │   ├── catalog.controller.ts
                │   └── dto/
                │       ├── create-test.dto.ts
                │       └── create-package.dto.ts
                │
                └── doctors/           ← Referring doctors + commission config
                    ├── doctors.module.ts
                    ├── doctors.service.ts
                    ├── doctors.controller.ts
                    └── dto/
                        └── create-doctor.dto.ts
```

## Quick placement rules

| If the file is named…              | It belongs in… |
|------------------------------------|----------------|
| `schema.prisma`, `seed.ts`         | `packages/database/prisma/` |
| `package.json` of database         | `packages/database/` |
| Anything under `modules/auth/`     | `apps/api/src/modules/auth/` |
| Anything under `modules/patients/` | `apps/api/src/modules/patients/` |
| …same pattern for bookings, billing, laboratory, reporting, catalog, doctors | matching folder under `apps/api/src/modules/` |
| `session.guard.ts`                 | `apps/api/src/common/guards/` |
| `current-user.decorator.ts`        | `apps/api/src/common/decorators/` |
| `prisma.service.ts` / `prisma.module.ts` | `apps/api/src/common/prisma/` |
| `main.ts`, `app.module.ts`         | `apps/api/src/` |
| Root `package.json`, `pnpm-workspace.yaml`, `setup.ps1` | `lms/` (root) |

## First-time run (after all files are in place)

```powershell
cd lms
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\setup.ps1
```

Then start the API:

```powershell
pnpm dev:api
```
