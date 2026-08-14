# Website Separation & Offline/Online Hybrid Sync — Scope

**Status:** planning only, not yet implemented — this is a scope document to build from later, not a description of current behavior.

**Purpose of this document:** capture the decision to separate `apps/website` from the local dev/deployment environment once the core software is built and tested, and define the scope for how the lab (offline-first, local) and the public website (online-hosted) connect to each other without breaking the offline guarantee. Written so this doesn't have to be re-derived from scratch when the time comes to actually build it.

---

## 1. Why the website needs to be separated out

`apps/website` currently lives in the same monorepo as the lab software and, as configured today, proxies its API calls straight to the clinic's local server address (`apps/website/next.config.ts` → `http://localhost:3000`). That's fine for local development, but it's not how this piece is meant to run in production, for two reasons:

- **It's the one part of this system meant to be reachable from the public internet.** Everything else (`apps/api`, `apps/web`) is deliberately local-only, LAN-scoped, no obligation to be online (see `02_Technical_Architecture.md § Offline-First Strategy`). The website is the opposite of that by design — it's the public booking/report-lookup surface, and needs real hosting, a real domain, HTTPS, uptime independent of any single clinic's server.
- **As currently wired, it depends on the clinic being reachable live.** That's a direct contradiction of the architecture doc, which explicitly rejected VPN/tunnel-based direct access for exactly this reason ("makes the lab dependent on a live tunnel to function normally — undermining the offline premise"). Today, if the clinic's internet drops, the public website's report lookup breaks with it. That's the core problem this document scopes a fix for.

**Decision:** once the core lab software (registration → billing → sample → results → reports) is built and tested end-to-end on the local/offline side, `apps/website` gets pulled out of that deployment path entirely and hosted separately (its own hosting, own domain, own database), consistent with what `02_Technical_Architecture.md` already describes as the target end-state ("a separate, internet-facing website").

This is a **deployment and data-flow change, not a rewrite** — the Next.js app itself doesn't need to be rebuilt, just re-pointed at its own backend/database instead of the clinic's local one.

---

## 2. The core problem this solves

Two different systems, two different jobs, and they'd been sharing one live connection that should never have existed between them:

- **Local Postgres (clinic server):** the single source of truth for everything — patients, billing, results, staff, invoices. Stays exactly as offline-first as it is today. Nothing about the lab's local operation changes.
- **Public website:** should never talk to the clinic server live. It needs its **own** database, holding only what it needs to serve public lookups/bookings, kept independently up regardless of any one clinic's connectivity at any given moment.

If the website reads from its own database instead of reaching into the clinic live, then "the clinic's internet is down" stops being a website outage — the website just keeps serving whatever was already synced to it, same as it always does.

---

## 3. Proposed data flow (offline-first, hybrid online layer)

### 3.1 Direction: one-way, lab → website, for report data

- Every time a report is finalized ("Ready for Collection" — see `apps/web`'s Laboratory page action, which is the natural trigger point already built), that's the signal to push the report out.
- Nothing before that point should ever leave the clinic's server. Draft/in-progress results, unfinalized reports, anything not yet released — stays local only.
- This reuses the `sync_outbox` table already present in `packages/database/prisma/schema.prisma` and the outbox-pattern design already described in `02_Technical_Architecture.md § Synchronization Strategy` — that pattern was designed for exactly this, it just doesn't have a running sync agent behind it yet.

### 3.2 Direction: website → lab, for booking requests

- Per the existing architecture doc, booking requests submitted on the public website do **not** write directly into the clinic's operational tables. They land in a staff review queue; the lab always has final say before a booking becomes real.
- This means the "online → offline" direction is a **request queue**, not a live write path — it doesn't require the clinic to be online at the moment someone submits a booking request; it just waits until the clinic next syncs.

### 3.3 What data actually crosses the boundary (report side)

A subset only — not a mirror of the whole database:

**Pushed to the website's database:**
- Tracking ID, report status (ready / not ready / collected)
- The secondary verification field used for lookup (phone / CNIC-last-4 / DOB — whichever the clinic uses)
- Enough of the finalized result data to render/print the report on the website

**Never pushed:**
- Billing/financial details, staff accounts, any other patient's data, anything not needed for the single public report-lookup screen. Keeping this subset intentionally small reduces what's exposed publicly and what needs securing outside the clinic's own walls.

### 3.4 What "offline-first" continues to mean under this hybrid model

- The clinic's ability to register patients, invoice, collect samples, enter/finalize results, and print — **all of it** — continues to have zero runtime dependency on internet connectivity, exactly as today. The website/Supabase layer sits entirely outside that critical path.
- If the clinic is offline for an extended period, reports finalized during that window simply queue locally (via the existing outbox table) and push out whenever connectivity returns — there's no failure state, no blocking, no degraded local behavior. The website will just be "behind" until the next successful sync, which is already the accepted tolerance in the architecture doc (originally scoped as "a minute or two," extended here to "however long the clinic is offline").
- The website, in turn, keeps answering lookups against whatever it already has, regardless of the clinic's current online/offline status at that moment — it was never blocked on a live connection to begin with.

---

## 4. What's needed to actually build this later (scope, not a build order)

- **A real sync agent:** something has to actually read `sync_outbox` and push queued rows out over HTTPS when internet is reachable, with retry/backoff on failure. This table exists in the schema today but nothing writes to or drains it yet — this is the one genuinely new piece of logic this plan requires.
- **A separate database for the website** (Supabase was discussed as one option, but any hosted Postgres works) — holding only the report-lookup subset described above, not a full mirror of the clinic's data.
- **Re-pointing `apps/website`** at its own database/API instead of the local-proxy rewrite it uses today, and deploying it on its own hosting separate from the clinic's server.
- **Access control carried over, not dropped:** the existing rule that report lookup requires tracking ID *plus* a secondary verification field (`02_Technical_Architecture.md § Website / Patient-Facing Security`) has to keep applying against whatever database backs the website — it should not become an openly queryable table just because it moved to different infrastructure.
- **A decision, separately, on backup/disaster-recovery:** the minimal "website" dataset described here is not a substitute for full database backups (patients, invoices, payments, everything). That's a distinct requirement already covered in `02_Technical_Architecture.md § Backup, Disaster Recovery, Ransomware Protection` and should stay scoped separately rather than conflated with the public-facing subset described here.

---

## 5. Non-goals for this phase

- This does **not** change anything about how the lab PC or owner's office PC operate today — no new dependency on internet for any local workflow.
- This does **not** mean building a hosted/multi-tenant SaaS version of the core lab software — that remains a separate future consideration (see `02_Technical_Architecture.md § Multi-Tenant-Ready, Single-Tenant-Deployed`). This is scoped narrowly to the public website's own connectivity, nothing more.
- This is **not** a decision to move the lab's primary database anywhere — local Postgres remains the one and only source of truth for clinic operations, permanently.
