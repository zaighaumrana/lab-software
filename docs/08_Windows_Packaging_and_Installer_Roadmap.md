# Windows Packaging & Installer Roadmap — Server / Workstation Architecture

**Status:** planning only, not yet implemented. This is a roadmap and eventual packaging specification to build from once the core software is finished and tested — it does not describe anything currently built. This document supersedes an earlier single-PC draft of this roadmap; the architecture below reflects a correction made after review: this system is a server + multiple workstations on a LAN, not a single machine, and the installer plan needs to reflect that from the start.

**Purpose of this document:** capture the target end-state for deployment — two installers, a defined server/workstation split, and the operational details (firewall, backups, health checks, static IP) that turn "click icon → login screen" from a demo into something that survives a real installation at a real clinic.

---

## 1. The end-user experience being built toward

```text
USB
└── Laboratory LMS
    ├── LMS-Server-Setup.exe
    └── LMS-Workstation-Setup.exe
```

No internet required for installation. On the lab's main PC: double-click `LMS-Server-Setup.exe`, install, finish. On every other PC (reception, sample collection, lab tech, admin): double-click `LMS-Workstation-Setup.exe`, enter the server's address once, finish.

After that, for every user, every day: **click desktop icon → login screen.** No terminals, no Node.js, no PowerShell, no browser address bar, no knowledge that any of the underlying technology exists.

---

## 2. Why this is two installers, not one

The system was originally scoped (see `02_Technical_Architecture.md`) as one local server serving multiple LAN workstations — reception, sample collection, lab tech, and admin each on their own PC. An earlier draft of this roadmap assumed a single all-in-one installer, which quietly contradicted that architecture. The corrected model:

```text
                         INTERNET
                            │
                            ▼
                    ┌───────────────┐
                    │ Online Server │
                    │ Website + DB  │   (see 07_Website_Separation...)
                    └───────────────┘
                            ▲
                            │ Sync (optional, when available)
                            │
                    ┌───────┴───────┐
                    │  LAB SERVER   │
                    │               │
                    │ PostgreSQL    │
                    │ NestJS API    │
                    │ Frontend      │
                    │ Puppeteer     │
                    │ Sync Agent    │
                    └───────┬───────┘
                            │  LAN
             ┌──────────────┼──────────────┐
             ▼              ▼              ▼
        Reception       Lab Tech        Admin
        Tauri shell     Tauri shell     Tauri shell
        (workstation)   (workstation)   (workstation)
```

**The critical rule:** workstations never contain the application backend or the database. They are thin clients of the lab server, nothing more.

---

## 3. Frontend placement: served by the server, not bundled per workstation

Two options were considered:

- **Option B (rejected):** bundle the compiled React frontend inside each workstation's Tauri shell.
- **Option A (adopted):** the server serves the frontend (as it does today via NestJS); every workstation's Tauri shell is just a window pointed at `http://<server-ip>:<port>`.

**Why Option A wins here specifically:** with multiple workstations, Option B means every frontend update requires reinstalling on every single workstation PC — reception, lab, admin, every time. Option A means updating one machine (the server) instantly updates what every workstation sees, with zero workstation-side reinstalls. Given this system's actual multi-PC shape, that operational difference is decisive.

This also makes the workstation installer substantially smaller than the server installer, since it contains none of PostgreSQL, the API, or Puppeteer/Chromium — just the Tauri shell and a small config screen. (Not stating a specific size target here: Tauri/WebView2 packaging, bundled assets, and code signing can all shift the final number — the useful architectural fact is what it *excludes*, not a byte count.)

**Production note:** the frontend served here must be the built static output (`pnpm build`), never a Vite dev server. There should be no `vite dev` anywhere in the shipped product — workstations point at the API serving pre-built static files, not at a development server.

---

## 4. Server installer — `LMS-Server-Setup.exe`

Installs and configures the entire local laboratory backend:

**Core**
- PostgreSQL, installed as a Windows Service
- Database creation
- Production migrations (`prisma migrate deploy` — never `migrate dev` in this path)
- Compiled NestJS API, registered as a Windows Service (auto-start, auto-restart on crash — via NSSM or equivalent)
- Puppeteer/Chromium (already an API dependency for PDF generation — see `06_Dependencies_and_Tooling.md`)
- Frontend build, served by the API
- Sync agent (see `07_Website_Separation_and_Offline_Online_Hybrid.md`)

**Windows configuration**
- **Windows Firewall rule, scoped correctly:** allow inbound TCP on the API port from the **private/LAN profile only** — never expose it to the public internet profile. Reception/lab/admin workstations can reach `Server:PORT`; the open internet cannot. The public website's sync pathway is separate and doesn't need this port opened at all.
- Required folders (data, logs, backups)
- Startup/service configuration

**Safety**
- Automatic backup (`pg_dump`) before any migration runs, with the backup verified before the migration proceeds — if the migration fails, the backup stays intact and the installer reports a clear failure rather than a silent or misleading "success." This applies to first install and to every future update alike.
  - Note: this pre-migration backup is a *local* safety net (protects against a bad migration, not against hardware failure — a backup on the same failing drive doesn't help if that drive dies). Nightly automated backups and where they're ultimately stored (local folder vs. an off-site/cloud copy) are a separate, ongoing operational concern already covered in `02_Technical_Architecture.md § Backup, Disaster Recovery, Ransomware Protection` — intentionally not re-scoped here to keep this document about packaging, not backup strategy.
- Installation logs written to a predictable location (e.g. `C:\ProgramData\LaboratoryManagementSystem\logs\`) — essential for on-site troubleshooting during a real install, not just a nice-to-have.
- Step-by-step installer progress with per-step pass/fail state (PostgreSQL / Database / Migrations / API / Service / Health check), so a failure is visible and actionable (`Retry` / `View Log` / `Cancel`) instead of a single opaque error code.

**Deployment prerequisite — must be documented, not just built:** the server PC needs a **stable LAN address** (static IP or a DHCP reservation). If the server's address changes silently (default DHCP behavior), every workstation loses connection to it simultaneously, with no obvious cause.

Scope boundary worth being explicit about: assigning that stable address is a **network configuration task, not an installer responsibility** — creating a DHCP reservation means logging into the clinic's router, which the installer has no business doing. What the installer *should* do: detect and display the server's current LAN IP, warn if it looks like a standard DHCP-assigned address rather than a static one, and point to the deployment documentation for the reservation step. A predictable hostname (e.g. `LMS-SERVER`, usable as `http://LMS-SERVER:4173` instead of a raw IP) is a reasonable future convenience on top of this, but — like auto-discovery — it's a v1.1+ nicety, not a v1 requirement; manual IP entry remains the safer default for now.

---

## 5. Workstation installer — `LMS-Workstation-Setup.exe`

Deliberately minimal:

- Tauri shell (desktop window, app icon, no browser chrome — no address bar, no accidental tab-closing, consistent window size)
- Application icon / desktop shortcut
- A one-time server-connection screen:

```text
Laboratory Server

Server address:
[ 192.168.1.100 ]

Port:
[ 4173 ]

        [ Test Connection ]

✓ Laboratory server found

        [ Continue ]
```

**The server address must be stored in a configuration file, not hardcoded into the compiled application.** If the server's address ever needs to change, that should mean editing a config value — accessible via a small "Server Connection" setting in the app, ideally admin-gated — not reinstalling every workstation in the building.

Auto-discovery of the server (broadcast/mDNS-style "searching for Laboratory Management Server...") was considered and **deliberately deferred past v1.** It would add a second running service on the server, a second firewall rule specifically for broadcast/multicast traffic, and its own edge cases (multiple servers on one network, timeout/fallback behavior) — real scope for a convenience feature layered on top of something that already works (typing one IP address, once, per workstation, ever). It's a reasonable v1.1+ candidate once the manual-entry flow has been proven at a real install; it should not be allowed to delay or complicate the first production installer.

**More important than discovery: handling connection loss in the running app.** The install-time "Test Connection" check only proves the server was reachable at that moment — on a real LAN, cables get unplugged, Wi-Fi drops, PCs reboot for Windows Update, and the server itself restarts occasionally. The workstation shell should detect when it loses contact with the server and say so plainly and calmly (e.g. "Connection to Laboratory Server lost — retrying...") rather than surfacing a generic error, and confirm clearly when it reconnects. This is v1-relevant, not a later nicety — it's the day-to-day reality of a LAN deployment, not an edge case.

---

## 6. Priority order for v1

**🔴 Must have**
1. Server / workstation architecture (this document)
2. PostgreSQL as a Windows Service
3. API as a Windows Service (auto-start, auto-restart)
4. Production migrations via `prisma migrate deploy`
5. Puppeteer/Chromium packaged and working on the server
6. Inno Setup installer(s)
7. Windows Firewall rule, LAN-scoped, automatic
8. Health checks during install
9. Installer logs
10. Backup before any migration
11. Server IP configuration + static IP / DHCP reservation documented
12. Workstation "enter server address, test connection" flow
13. Workstation connection-loss detection and reconnect UX (see §5)
14. Real end-to-end testing on a clean Windows machine (both installers)

**🟡 Very useful, not blocking v1**
15. Admin/server status view — see §7 below
16. Better installer error/recovery UI beyond the basics in §4
17. A backup/restore interface (beyond the automatic pre-migration backup)

**🟢 Later**
18. Automatic server discovery
19. Server hostname (`LMS-SERVER`) as an alternative to IP entry
20. Auto-updater
21. More sophisticated deployment/fleet management

---

## 7. Admin/server status visibility

Useful primarily for whoever is physically installing and maintaining this system — not something reception or lab-tech users need to see. Something like:

```text
Database          ● Running
API               ● Running
Printing Engine   ● Running
Sync Service      ● Offline

Server IP         192.168.1.100
API Port          4173

Last Backup       14 Aug 2026 02:00
Backup Status     ✓ Healthy
```

**Important architectural distinction to preserve in this UI:** "Sync Service: Offline" is not an LMS failure — it means the internet is currently unavailable, which by design does not affect local operation (registration, billing, samples, results, reports, printing all continue normally). This status view should visually reflect that difference rather than flagging it as an error.

**Scope note — the cheap version first:** a full standalone status utility is real, separate scope (effectively a fourth thing to build and package). For v1, the pragmatic version of this is a protected admin route inside the API/frontend that's already being built (e.g. `http://<server>:<port>/admin/status`), not a separate native application. That gets nearly all the value with none of the extra packaging work, since it rides on infrastructure already in progress. A standalone desktop utility remains a reasonable later addition if it proves worth the extra build.

---

## 8. The two-world architecture this all protects

```text
Local world (must work with zero internet)     Online world (can wait for connectivity)
────────────────────────────────────────       ─────────────────────────────────────────
Registration                                    Public website / online bookings
Billing                                         Report lookup (via its own synced DB —
Samples                                           see 07_Website_Separation...)
Results / finalization                          SMS
Reports                                         Cloud backup / offsite sync
Printing
Patient history / search
```

Every decision in this document exists to keep the left column fully functional with the LAN alone, and to let the right column degrade gracefully (not fail loudly) whenever the internet isn't there. This is the same principle already established in `01_Product_Specification.md` and `02_Technical_Architecture.md` — this document is the packaging-level expression of it, not a new decision.

---

## 9. Open item carried over from the previous draft: `pkg`

The requirement is "the client must not need Node.js installed" — not "must use `pkg` specifically." `pkg` is one candidate for compiling the API to a standalone executable, but it has a known rough history with Puppeteer's Chromium path resolution inside its virtual filesystem. Treat `pkg` as **experimental, to be validated early against the actual Puppeteer setup in this codebase** — if it causes real problems, switch to an alternative (e.g. shipping a minimal embedded Node runtime alongside the compiled API) rather than redesigning the printing module around a packaging tool's limitation.

---

## 10. Sequencing

1. Compile the API to a standalone executable (validate `pkg` per §9; have a fallback ready).
2. Write the server Inno Setup script per §4.
3. Write the workstation Inno Setup script per §5.
4. Build the Tauri shell (shared by both installers, workstation-mode just points elsewhere).
5. Test the full server install end-to-end on a clean Windows machine/VM.
6. Test the full workstation install against that server, from a second machine.
7. Iterate — installer scripts essentially never work perfectly on the first pass; budget real time for this, not a single pass.

---

## 11. Prerequisites before this phase starts

- Confirmation the target deployment OS is Windows.
- Access to at least two real Windows machines or VMs (one to act as server, one as workstation) — needed for every round of testing, not just the first, since this architecture specifically requires verifying cross-machine LAN communication, not just a single-box install.
- **The core software should be functionally stable first:** registration → billing → sample → results → finalization → report → printing (per `03_Core_Domain_Design.md`). Packaging work should not start changing the application's structure — freeze the core flow, then package what's frozen. Packaging around software that's still actively changing means redoing installer work repeatedly for no reason.


## E1 prerequisite now implemented (2026-10-04)

Use the reusable `scripts/provision-runtime-db.ps1` helper before restricted API
startup. `-ConfigureAdminConnectionOnly` privately verifies installation/admin
access without role/grant changes. Normal provisioning generates or privately
accepts the runtime login password, verifies grants and writes the ignored
`apps/api/.env.runtime`. Subsequent deployments use owner migrations followed by
`-GrantsOnly`. Preserve owner/admin tooling separately; the production API service
account must not be able to read the owner environment file. No full installer,
service-account rollout or backup/restore is implemented by this helper.
See [E1 deployment details](Database_V2_Phase_E1_Runtime_DB_Security_2026-10-04.md).
