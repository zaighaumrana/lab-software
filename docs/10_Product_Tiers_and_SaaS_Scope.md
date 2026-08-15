# 10 — Product Tiers & SaaS Scope

**Purpose:** defines the planned multi-tier structure for the LabFlow product — which tiers are cloud-hosted vs. offline, why that split is the real dividing line (not feature count), and what it means architecturally for licensing, onboarding cost, and which existing docs apply to which tier.
**Why it exists:** the product started as a single offline build for one client. It's now explicitly being planned as a tiered SaaS product — this document captures that scope decision so tier boundaries are deliberate rather than discovered ad hoc while building the second and third customer.
**Read this:** before making any decision about what belongs in which tier, before writing tier-specific licensing/billing code, and before assuming `09_LabFlow_Licensing_and_Subscription_Architecture.md`'s mechanisms apply everywhere (they don't — see §3).

**Status: design only, nothing in this document has been built.** Tier names, feature splits, and the online/offline boundary below are the current thinking, not a finalized product spec. **Pricing is explicitly deferred** — nothing in this document should be read as a price commitment for any tier; that's a separate decision to be made later, once scope is settled.

---

## 1. The three tiers

| Tier | Hosting | Billing shape | Who it's for |
|---|---|---|---|
| **Basic** | Cloud-hosted (vendor infrastructure) | Usage-based (e.g. per receipt/report) | Small clinics currently priced out of any lab software at all — the "make digitization cheap and accessible" tier |
| **Pro** | Cloud-hosted (vendor infrastructure) | Recurring subscription | Clinics that want the full feature set but don't have — or don't need — a hard offline requirement |
| **Offline / Enterprise** *(what exists today)* | Self-hosted, on the client's own hardware, zero internet dependency | Recurring subscription (yearly/monthly), see `01_Product_Specification.md § Business Context` | Clinics where connectivity cannot be a point of failure, and who can afford to pay for that guarantee |

**These names are working labels, not final.** The one thing this document commits to is the *shape* of three tiers split along the online/offline line — exact naming (this document has been calling the current build "Pro" in earlier docs, which is being corrected here — see §5) and exact feature lists per tier are open and expected to be refined as real second/third customers come in.

---

## 2. The real dividing line: online vs. offline, not "more features"

It's tempting to think about tiers purely as "fewer features = cheaper tier." That's true as far as it goes, but it's not the thing that actually drives cost and engineering complexity here. **The dividing line that matters is whether the software runs on infrastructure the vendor controls (cloud) or infrastructure the client controls (offline/self-hosted).**

This single distinction cascades into almost everything else that differs between tiers:

- **Tamper-resistant licensing/usage metering** is trivial on a cloud tier (the vendor's own server counts events — there's no untrusted party in the loop) and genuinely hard on the offline tier (hence all of `09_LabFlow_Licensing_and_Subscription_Architecture.md` — clock rollback detection, signed responses, trusted cloud timestamps). See §3.
- **Onboarding cost** is low for cloud tiers (create a tenant, done) and high for the offline tier (site visit, Windows installer per `08_Windows_Packaging_and_Installer_Roadmap.md`, client-purchased hardware per `02_Technical_Architecture.md § Deployment Model`).
- **Update delivery** is instant for cloud tiers (deploy once, every tenant is current) and deliberately manual/versioned for the offline tier (`02_Technical_Architecture.md § Update Delivery`), because that tier's whole premise is no forced dependency on the vendor being reachable.
- **The core offline guarantee** (`02_Technical_Architecture.md § Offline-First Strategy`) is, definitionally, only true for the offline tier. Basic and Pro are ordinary cloud software — if the clinic's internet is down, Basic/Pro are down. That's an acceptable, explicit tradeoff for those tiers, not an oversight.

Feature differences between Basic and Pro (which modules are enabled) matter too, but they're the *cheap* kind of differentiation — the existing feature-flag and multi-tenant architecture (`02_Technical_Architecture.md § Multi-Tenant-Ready, Single-Tenant-Deployed`, `01_Product_Specification.md § Product Philosophy` principle 10) already exists specifically so this is a configuration decision, not a fork. The online/offline split is the expensive, architectural kind of differentiation, and it's the one this document is actually about.

---

## 3. Licensing model per tier

| Tier | Licensing approach |
|---|---|
| Basic, Pro (cloud) | Ordinary hosted SaaS metering and billing — usage/subscription state lives entirely in vendor-controlled infrastructure. No offline license cache, no clock-tamper detection, no signed license responses needed, because there's no client-controlled machine in the trust boundary at all. |
| Offline / Enterprise | Full mechanism in `09_LabFlow_Licensing_and_Subscription_Architecture.md` applies: activation, periodic validation when online, offline grace period, trusted-cloud-timestamp clock-tamper resistance, signed license responses. This tier is the *only* one that needs this apparatus, and it needs all of it, because the software runs somewhere the vendor has no persistent access to. |

This is a direct consequence of §2, not a separate decision — the whole reason `09_LabFlow_Licensing_and_Subscription_Architecture.md` exists is to make tamper-resistant licensing work in a client-controlled environment. Cloud tiers don't have that environment, so that document doesn't apply to them, and building a lighter version of it for Basic/Pro would be solving a problem those tiers don't have.

---

## 4. Usage-based billing (Basic tier specifically)

Basic's usage-based model (e.g. billing per receipt/report volume) is a natural fit for the cloud-hosted approach specifically *because* it's cloud-hosted: the count is whatever the vendor's own database says it is, generated by the vendor's own API, with no local counter for a client to edit. This is the same tamper-resistance argument as §3, applied to a metering mechanism instead of a license expiry date — the moment usage-counting needs to survive on a machine the client controls, it becomes exactly the same hard problem the offline tier's licensing already has to solve (a local counter is just as editable as a local clock). Keeping Basic cloud-only sidesteps that problem entirely rather than needing to solve it.

---

## 5. Naming correction carried over from earlier docs

Earlier project documentation (written before this tiering decision) referred to the current offline build as the "Pro" tier. That naming is superseded by this document: the current build is the **Offline/Enterprise** tier, sitting *above* both Basic and Pro in the tier structure, not as "Pro" itself. Any earlier reference to "Pro" meaning today's build should be read as this tier until/unless final tier naming is decided.

---

## 6. What stays shared across tiers vs. what doesn't

**Shared (one codebase, one core product):**
- Domain model, business rules, workflows — `03_Core_Domain_Design.md` applies to all tiers equally; a result, an invoice, a report mean the same thing regardless of tier.
- Feature-flag/multi-tenant scaffolding — already built in from day one, this is exactly the mechanism that makes Basic vs. Pro a configuration difference rather than a fork.

**Not shared (genuinely different per tier):**
- Deployment topology — cloud tiers are standard multi-tenant hosted infrastructure; the offline tier is the server/workstation LAN model in `08_Windows_Packaging_and_Installer_Roadmap.md`. These are different deployment shapes, not different configurations of the same deployment.
- Licensing mechanism — per §3.
- Sync/website relationship — the offline tier's public website sync (`07_Website_Separation_and_Offline_Online_Hybrid.md`) exists specifically to bridge an offline lab server to an online-facing site; a cloud tier's website integration doesn't need an outbox/sync-agent pattern at all, since the tenant's data already lives in vendor-controlled cloud infrastructure — it can be queried directly rather than synced.

---

## 7. Onboarding cost asymmetry — why this split serves both goals at once

This tier structure is what makes "cheap digitization for small clinics" and "capture full value from clients who can afford more" simultaneously achievable without contradiction:

- Basic/Pro's low onboarding cost (no installer, no site visit, no client-purchased hardware) means the vendor can profitably serve a small clinic at a price point that would be uneconomical for the offline tier — this is what actually makes the low-price tier viable, not just a discount decision.
- The offline tier's price is justified by real engineering cost (everything in `06_Dependencies_and_Tooling.md`, `08_Windows_Packaging_and_Installer_Roadmap.md`, and `09_LabFlow_Licensing_and_Subscription_Architecture.md` exists because of it) and a real guarantee competitors in this market don't offer at all (see `01_Product_Specification.md § Business Context`) — so pricing it well above Basic/Pro reflects genuine differentiated value, not arbitrary tiering.

---

## 8. Explicitly out of scope for this document

- **Exact pricing for any tier** — deferred entirely, per the Status line above.
- **Exact feature list per tier** (which modules Basic includes vs. excludes) — noted directionally in §1's table, not finalized.
- **Final tier names** — "Basic," "Pro," and "Offline/Enterprise" are working labels only.
- **Implementation of any of this** — no cloud multi-tenant billing infrastructure, no usage-metering API, no tier-gating logic exists yet. This is a scope/architecture document, matching the same "design only" convention as `05_Analytics_Architecture.md` and `09_LabFlow_Licensing_and_Subscription_Architecture.md`.
