# 01 — Product Specification

**Purpose:** defines what LabFlow is, who it serves, why it exists, and the product principles that govern its development across all commercial tiers. This is the business and product layer, independent of any single deployment or technical implementation.

**Why it exists:** every technical, architectural, commercial, and design decision downstream should trace back to a requirement or principle stated here. LabFlow is a single product platform, not a collection of client-specific builds.

**Read this:** first, before any other document. Read again whenever scope is questioned, a new module is proposed, a tier distinction is introduced, or an implementation decision risks creating product divergence.

---

## Executive Summary

**LabFlow** is a laboratory management platform designed for diagnostic laboratories ranging from small independent labs to larger multi-branch organizations.

The product began from a practical offline-first laboratory requirement but has evolved substantially beyond that original implementation. LabFlow is now being developed as a reusable commercial software platform with **three product tiers**:

1. **Basic Cloud**
2. **Pro Cloud**
3. **Offline / Enterprise**

All three tiers belong to the same LabFlow product family and are intended to share the same core domain model, business rules, APIs, and application architecture wherever practical.

The primary differences between tiers are deployment model, operational capabilities, infrastructure ownership, feature entitlements, and service level rather than separate codebases.

The current codebase already contains a substantial shared laboratory-management core including patient management, billing, laboratory processing, result management, reporting, analytics, RBAC, doctor/referral functionality, cash reconciliation, and tenant/branch-aware data structures. The independent public website was extracted to `zaighaumrana/labwebsitedemo` on 2026-10-01; it is outside the local LabFlow workspace.

Several broader platform capabilities are designed or scaffolded but are not yet complete, including full SaaS tenant provisioning, product-tier entitlement enforcement, cloud/offline synchronization, Windows production packaging, automated backup infrastructure, licensing enforcement, corporate workflows, complete package-test processing, and advanced public website administration.

LabFlow should therefore be treated as an **evolving product platform**, not as the original small-lab MVP from which development began.

## Background

LabFlow originated from a common operational problem in laboratory software: many cloud-only systems make core laboratory operations dependent on continuous internet connectivity.

Patient registration, invoicing, payment collection, sample handling, result entry, and report printing are business-critical activities. A laboratory using the Offline / Enterprise tier must therefore remain operational even when internet connectivity is unavailable.

As development progressed, the product expanded beyond the needs of a single offline installation.

The current direction is a reusable laboratory-management platform capable of supporting both:

* vendor-managed cloud deployments; and
* laboratory-owned offline or hybrid deployments.

The original small-laboratory implementation remains useful as the foundation of the product, but its machine count, patient volume, staffing structure, pricing arrangement, and individual deployment assumptions no longer define the boundaries of LabFlow.

## Business Context

**Product model:** LabFlow is a commercial software product offered through recurring subscription or licensing models rather than a one-off custom software project.

The commercial structure is organized around three product tiers:

### Basic Cloud

A vendor-managed cloud offering intended to provide the essential LabFlow workflow with minimal infrastructure responsibility for the customer.

The laboratory uses LabFlow through the hosted platform while the vendor operates the underlying application infrastructure.

### Pro Cloud

A vendor-managed cloud offering for laboratories requiring broader operational, administrative, analytical, branch, workflow, or business-management capabilities.

Pro remains part of the same hosted LabFlow platform but receives additional product entitlements.

### Offline / Enterprise

A locally deployed LabFlow environment intended for laboratories that require local infrastructure ownership, offline operation, stronger deployment control, or enterprise/hybrid capabilities.

The local laboratory environment remains operational independently of internet availability. Online services may be synchronized with the local system where required.

The detailed commercial and capability distinction between these tiers is defined in `10_Product_Tiers_and_SaaS_Scope.md`.

**Pricing model:** recurring commercial access is the default model. Depending on tier and market requirements, this may include monthly subscription, yearly subscription, enterprise licensing, usage-based components, support agreements, or combinations of these models.

**Software ownership:** customers own their laboratory data. LabFlow's source code, product architecture, intellectual property, shared platform components, and reusable product functionality remain the property of the vendor.

Customer data ownership must remain independent of subscription or license status. Expiry or suspension of a commercial entitlement must never silently delete customer data.

Offline / Enterprise licensing architecture is defined separately in `09_LabFlow_Licensing_and_Subscription_Architecture.md`.

## Business Requirements

* Maintain one LabFlow product core across all commercial tiers.
* Support **Basic Cloud, Pro Cloud, and Offline / Enterprise** from a shared architecture.
* Support multiple laboratory customers without customer-specific code forks.
* Maintain strict tenant isolation for cloud deployments.
* Support multiple branches without requiring a domain-model rewrite.
* Allow product capabilities to be controlled through tier entitlements and configuration.
* Keep product entitlements separate from employee permissions and RBAC.
* Provide complete laboratory workflows covering patients, billing, samples, results, and reports.
* Provide public-facing functionality for laboratory information, bookings, and patient report access.
* Support configurable SMS and future communication providers.
* Allow Offline / Enterprise deployments to perform core laboratory work without internet connectivity.
* Preserve customer ownership and portability of laboratory data.
* Support recurring subscription/licensing as a first-class product concern.
* Allow new modules and integrations to be added without forking the product.
* Maintain a clear boundary between currently implemented capabilities and roadmap capabilities.

## Product Vision

Build a modern laboratory operating platform capable of serving a small independent laboratory, a growing multi-branch organization, or an enterprise requiring local infrastructure without maintaining separate products for each use case.

LabFlow should provide a common product experience across deployment models while allowing infrastructure and feature capabilities to vary by tier.

The long-term product model is:

```text
                         LabFlow Product Core
                                  │
                 ┌────────────────┼────────────────┐
                 │                │                │
           Basic Cloud        Pro Cloud     Offline / Enterprise
                 │                │                │
          Managed Cloud     Managed Cloud      Local / Hybrid
          Core Features    Expanded Features   Offline Capable
```

A feature should not require a separate codebase simply because one customer runs it in the cloud and another runs it locally.

## Product Philosophy

Every architectural decision must satisfy these principles. When a decision is contested, this list settles it:

1. **One product, multiple tiers.** Basic Cloud, Pro Cloud, and Offline / Enterprise are configurations of LabFlow, not separate software products.

2. **Shared core, no customer forks.** Customer-specific requirements should be handled through configuration, entitlements, branding, integrations, or extension points rather than permanent code divergence.

3. **Tenant isolation is foundational.** Data belonging to one laboratory must never become visible or accessible to another tenant.

4. **Branches are first-class domain concepts.** Multi-branch capability must not require redesigning the core schema.

5. **Offline capability is a product capability, not the entire product identity.** Offline-first operation is essential to the Offline / Enterprise tier while cloud tiers are operated as hosted services.

6. **Entitlements and permissions are different.** A subscription determines which product capabilities a laboratory owns; RBAC determines which employees may use those capabilities.

7. **Business logic lives in the backend, never solely in the UI.**

8. **Audit everything that matters.** Clinically or financially significant information must not be silently overwritten or deleted. Corrections and amendments must remain traceable.

9. **Everything external should be replaceable.** SMS providers, printers, storage providers, payment integrations, authentication providers, and similar dependencies should use stable abstractions where practical.

10. **Integrations are optional.** Core laboratory operations must not become unusable because an SMS gateway, cloud service, analytics provider, or other external integration is unavailable.

11. **Customer data belongs to the customer.** It must remain exportable and recoverable.

12. **Configuration before customization.** New customer requirements should first be solved through product configuration or reusable product functionality.

13. **Product tiers are entitlement boundaries, not codebase boundaries.**

14. **Architecture should evolve without breaking existing deployments.** Database migrations, APIs, licensing, synchronization, and installers must support controlled upgrades.

15. **Designed does not mean implemented.** Documentation must explicitly distinguish implemented functionality, partial/scaffolded functionality, and planned architecture.

## Stakeholders

| Stakeholder                              | Role                                                                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Laboratory Owner / Organization          | Customer purchasing and operating LabFlow                                                                                  |
| Laboratory Administrator                 | Manages laboratory configuration, users, finance, reporting, and operational oversight                                     |
| Operational Staff                        | Handles registration, billing, samples, laboratory processing, results, and other daily workflows according to permissions |
| Pathologists / Authorized Clinical Staff | Review or authorize clinical information where workflow configuration requires it                                          |
| Referring Doctors                        | Indirect or direct participants through referrals, commissions, statements, and future portal functionality                |
| Corporate Customers                      | Organizations whose employees or members receive laboratory services under corporate arrangements                          |
| Patients                                 | Booking users, SMS recipients, report-lookup users, and future patient-account/mobile users                                |
| Vendor / Platform Operator               | Builds, operates, licenses, supports, and evolves the LabFlow product                                                      |
| Enterprise IT / Deployment Administrator | Manages infrastructure for Offline / Enterprise deployments where applicable                                               |

## Scope (Current Product)

The current LabFlow codebase has progressed significantly beyond its original MVP.

### Current shared product core

The implemented or substantially implemented product core includes:

* Patient registration, search, updating, and patient-history foundations
* Internal patient/laboratory identifiers
* Test catalog
* Test parameters and reference ranges
* Package catalog foundations
* Invoicing
* Invoice-line price snapshots
* Manual discounts and discount reasons
* Payment recording
* Multiple payment-method representations
* Sample creation and laboratory lifecycle handling
* Sample receiving, acceptance, rejection, testing, and outsourcing workflows
* Manual result entry
* Reference-range comparison
* Abnormal and critical-result flagging
* Explicit result saving and finalization
* Result reopening and amendment foundations
* Report readiness processing
* Report PDF generation
* Invoice PDF generation
* Doctor statement PDF generation
* Plain-paper and letterhead printing modes
* Configurable report margins
* Continuous and one-test-per-page report layouts
* Print tracking and reprint counts
* Doctor/referral management
* Doctor commission calculation and snapshots
* Administrative analytics
* Operational analytics
* Financial analytics
* Test analytics
* Doctor analytics
* Outsourcing analytics
* Business insights
* Admin dashboard
* Operator dashboard
* Cash-shift reconciliation
* Centralized permission-based RBAC
* Tenant-aware and branch-aware schema foundations
* Implemented separation of the independent public website (see Doc 07)
* SMS gateway abstraction
* Current SendPK SMS integration
* Notification persistence and delivery-state tracking

### Product capabilities currently partial or scaffolded

The following capabilities exist in the schema, architecture, or selected application layers but are not yet complete end-to-end product workflows:

* Package selection and package catalog management
* Automatic package expansion into constituent laboratory tests
* Corporate accounts and corporate billing
* Home collection
* Full barcode generation, label printing, and scanner workflow
* Application-wide audit logging
* Feature-flag and product-entitlement enforcement
* Multi-role expansion beyond the currently active permission bundles
* Notification retry/background processing
* Refund and void workflows
* Doctor commission payout/reversal workflow
* Advanced amendment notifications
* Partial-report release configuration
* Public website administration/CMS
* Branch and doctor directories on the public website
* Public news/announcement management

### Platform capabilities designed but not yet complete

The following are part of the LabFlow product architecture but should not be treated as currently delivered functionality:

* Full hosted multi-tenant SaaS control plane
* Automated tenant provisioning
* Basic/Pro subscription entitlement enforcement
* Offline / Enterprise licensing enforcement
* Local-to-cloud synchronization
* Cloud-to-local booking synchronization
* Production Sync Agent
* Windows Server installer
* Windows Workstation application/installer
* Automated backup and restore management
* Production disaster-recovery tooling
* Internal HTTPS automation
* Full printer-driver abstraction
* Payment-provider abstraction
* Storage-provider abstraction
* SaaS billing integration
* Centralized subscription management

## Non-Goals (Current Product Release)

The following are not requirements for the current core product release, although some remain part of the longer-term roadmap:

* Direct laboratory analyzer/machine integration
* Full LIS/HL7 analyzer ecosystem
* Insurance claim processing
* Full inventory and reagent-management system
* Automated reagent consumption forecasting
* Visual report-template designer
* Plugin marketplace
* Third-party extension marketplace
* Full patient account system
* Patient mobile application
* Complete doctor portal
* AI-assisted clinical interpretation
* AI anomaly detection
* Enterprise data warehouse
* Full accounting/ERP replacement
* Country-specific insurance or government-claim integrations that have not yet been selected

Historical data migration is treated as a deployment/import capability rather than a core runtime module. Import tools may support CSV, Excel, SQL exports, APIs, or other formats depending on the source system.

## Operating Parameters (Current Product Direction)

| Parameter                     | Value                                                                                                                  |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Product model                 | One LabFlow platform with three commercial tiers                                                                       |
| Commercial tiers              | Basic Cloud, Pro Cloud, Offline / Enterprise                                                                           |
| Deployment model              | Vendor-managed cloud for Cloud tiers; local/hybrid deployment for Offline / Enterprise                                 |
| Tenancy                       | Tenant-scoped architecture; cloud tiers require strict multi-tenant isolation                                          |
| Branches                      | Branch-aware architecture; multi-branch product support is a first-class goal                                          |
| Result entry                  | Manual result entry currently supported; analyzer integration is future scope                                          |
| Result release workflow       | Explicit entry/save → finalize/release workflow                                                                        |
| Result amendments             | Reopen/amend/supersede foundations implemented; audit and notification behavior continues to be hardened               |
| Report access                 | Tracking ID + secondary verification; report availability governed by clinical readiness and payment state             |
| Booking model                 | Public booking requests enter laboratory workflow; advanced scheduling remains expandable                              |
| Licensing                     | Cloud tiers use subscription entitlement; Offline / Enterprise uses recurring licensing architecture defined in Doc 09 |
| Branding                      | Tenant/laboratory branding should be configurable without code forks                                                   |
| Language                      | English currently; architecture should support localization                                                            |
| RBAC                          | Permission-driven authorization architecture                                                                           |
| Currently active role bundles | ADMIN and LAB_OPERATOR                                                                                                 |
| Reserved/future roles         | Additional operational and clinical roles may be enabled through defined permission bundles                            |
| Product entitlement           | Tier/tenant capability enforcement is separate from RBAC and remains an active platform requirement                    |
| Payment methods               | Cash, Bank Transfer, EasyPaisa, JazzCash represented; payment-provider abstraction remains future platform work        |
| Analytics                     | Significant analytics subsystem implemented; tier-specific entitlement boundaries remain to be defined                 |
| Public website                | Repository separation implemented; independent website in `zaighaumrana/labwebsitedemo`; online service/bridge planned   |
| SMS                           | Gateway abstraction exists; SendPK currently implemented                                                               |
| Offline operation             | Mandatory capability of Offline / Enterprise                                                                           |
| Cloud synchronization         | Designed for Offline / Enterprise hybrid operation; production implementation pending                                  |

## Functional Requirements

### Core Laboratory Platform

LabFlow must support:

* patient registration and patient search;
* patient history;
* laboratory identifiers;
* test and rate catalog management;
* test parameters and reference ranges;
* packages;
* invoicing;
* discounts;
* payment tracking;
* sample lifecycle management;
* result entry;
* result validation/finalization;
* result amendments and history;
* abnormal/critical result detection;
* report generation;
* report printing and reprinting;
* report access control;
* doctor/referral management;
* doctor commissions;
* operational dashboards;
* financial dashboards;
* analytics;
* user management;
* role-based permissions;
* tenant and branch isolation;
* configuration;
* auditability;
* notification handling;
* backup/recovery architecture;
* import/export capability.

### SaaS Platform

Cloud editions must progressively support:

* tenant provisioning;
* tenant isolation;
* subscription state;
* product tiers;
* product entitlement enforcement;
* tenant configuration;
* tenant branding;
* branch management;
* cloud deployment and upgrades;
* centralized monitoring;
* subscription and licensing integration;
* usage measurement where required by commercial model.

### Offline / Enterprise Platform

Offline / Enterprise must progressively support:

* local PostgreSQL authority;
* local API/application operation;
* zero internet dependency for core laboratory work;
* controlled local installation;
* workstation connectivity;
* production Windows packaging;
* local backup and restore;
* license validation with safe offline grace behavior;
* optional cloud synchronization;
* hosted public website integration;
* cloud booking synchronization;
* report synchronization;
* connectivity recovery;
* upgrade-safe migrations.

### Public Website

The public platform may support:

* laboratory information;
* About;
* services;
* test catalog;
* rate list;
* online booking;
* report lookup;
* report download where eligible;
* contact information;
* branches;
* doctors;
* promotions;
* news and announcements;
* tenant branding;
* future CMS capabilities.

Public website functionality must operate through an online service boundary and must never directly access local PostgreSQL, the local NestJS API, the laboratory LAN, the local filesystem, or locally stored report files. Integration through a sync/bridge agent is future work (Doc 07).

### Notifications

The product architecture should support:

* booking confirmation;
* booking-status updates;
* payment reminders;
* report-ready notices;
* critical-value notifications;
* sample rejection/recollection notices;
* operational notifications;
* delivery tracking;
* retries;
* provider replacement;
* future WhatsApp/email/push channels.

Notification features may vary by product tier and configured provider.

### Advanced Business Modules

The architecture should support future or expanding modules including:

* corporate accounts;
* corporate discounts;
* corporate billing;
* split payment;
* consolidated statements;
* home collection;
* collector scheduling;
* outsourcing;
* doctor payouts;
* advanced branch management;
* configurable pricing rules.

These modules must reuse the shared LabFlow domain rather than creating separate customer-specific workflows.

## Non-Functional Requirements

* **Tenant isolation:** one tenant must never gain unauthorized access to another tenant's data.

* **Offline availability:** Offline / Enterprise core laboratory operations must continue without internet connectivity.

* **Cloud availability:** Basic Cloud and Pro Cloud must be deployable as centrally managed online services with appropriate production availability and monitoring.

* **Data integrity:** clinically or financially significant data must not be silently overwritten. Amendments and corrections must remain traceable.

* **Security:** strong password hashing, permission-based RBAC, secure session handling, tenant isolation, transport encryption for internet-facing services, rate limiting for sensitive public endpoints, and secure secret handling.

* **Recoverability:** every production deployment model must have a documented and tested backup/restore strategy appropriate to that tier.

* **Upgradeability:** application and schema upgrades must preserve customer data and support controlled migration.

* **Extensibility:** external integrations should attach through stable service boundaries, interfaces, events, or adapters instead of being embedded throughout domain logic.

* **Scalability:** architecture must support growth from small laboratories to larger multi-user and multi-branch deployments without replacing the core domain model.

* **Observability:** production systems should provide sufficient logs, health information, audit records, delivery status, and operational visibility to diagnose failures.

* **Portability:** customer data must remain exportable in usable formats.

* **Configuration:** branding, features, branch behavior, integrations, printing, and tier capabilities should be configurable wherever practical rather than hardcoded.

* **Consistency:** cloud and offline editions should share domain rules wherever deployment differences do not require different behavior.

## Product Roadmap

LabFlow's roadmap is now the evolution of a shared product platform rather than a progression from one client deployment into a future product.

```mermaid
flowchart LR
    P1[Phase 1: Core Product Hardening] --> P2[Phase 2: Entitlements & RBAC Expansion]
    P2 --> P3[Phase 3: SaaS Control Plane]
    P3 --> P4[Phase 4: Basic & Pro Cloud]
    P4 --> P5[Phase 5: Offline / Enterprise Productization]
    P5 --> P6[Phase 6: Hybrid Sync & Multi-Branch]
    P6 --> P7[Phase 7: Advanced Business Modules]
    P7 --> P8[Phase 8: Integrations & Portals]
    P8 --> P9[Phase 9: Ecosystem, AI & Mobile]
```

1. **Core Product Hardening**
   Complete and harden the existing laboratory core, including clinical data integrity, package processing, reporting correctness, auditability, payments, notification reliability, automated testing, and production security.

2. **Entitlements & RBAC Expansion**
   Separate tenant product entitlement from employee authorization. Expand the existing permission architecture into additional operational roles while introducing tier/feature entitlement enforcement.

3. **SaaS Control Plane**
   Add tenant onboarding, subscription state, tenant configuration, centralized deployment/monitoring, feature entitlements, and the infrastructure required to operate LabFlow as a managed service.

4. **Basic & Pro Cloud**
   Productize the managed cloud editions using the shared LabFlow core, with capabilities enabled according to commercial tier.

5. **Offline / Enterprise Productization**
   Complete Windows packaging, local deployment tooling, licensing, backup/restore, workstation deployment, health checks, secure upgrades, and production support tooling.

6. **Hybrid Sync & Multi-Branch**
   Complete reliable local-to-cloud and cloud-to-local synchronization, hosted public services for offline customers, branch federation, central reporting, conflict handling, and synchronization monitoring.

7. **Advanced Business Modules**
   Complete corporate accounts, corporate billing, home collection, advanced pricing, expanded doctor settlement, barcode workflows, inventory-related functionality where commercially justified, and additional operational modules.

8. **Integrations & Portals**
   Add analyzer integrations, doctor portal functionality, expanded communication providers, payment providers, external APIs, and enterprise integrations.

9. **Ecosystem, AI & Mobile**
   Expand into patient mobile experiences, AI-assisted operational or clinical tooling, marketplace/plugin architecture, advanced analytics, and a broader LabFlow ecosystem where commercially justified.

## Success Criteria

* Basic Cloud, Pro Cloud, and Offline / Enterprise operate from the same LabFlow product core without permanent tier-specific code forks.

* A new laboratory tenant can be onboarded primarily through configuration, subscription/tier assignment, branding, and data initialization rather than custom development.

* Tenant isolation is enforced consistently across API, database access, background processing, analytics, reporting, and public functionality.

* Product entitlement and employee RBAC remain separate concerns.

* The core workflow from patient registration through invoice, sample, result finalization, and report generation is reliable and clinically traceable.

* Offline / Enterprise can complete core laboratory operations with internet connectivity unavailable.

* Cloud editions can operate without local server infrastructure.

* Offline / Enterprise can synchronize selected public/online functionality without making the local laboratory dependent on that synchronization.

* Clinically significant amendments preserve history and attribution.

* Financially significant corrections preserve history and attribution.

* Production deployments have tested backup and recovery procedures appropriate to their deployment tier.

* Adding another tenant or branch does not require redesigning the core database model.

* New commercial features can be assigned through product entitlements rather than maintaining separate editions of the codebase.

* External integrations can be added or replaced without rewriting core laboratory workflows.

* Documentation clearly identifies whether a capability is implemented, partially implemented/scaffolded, or planned.

---

**Dependencies:** none. This is the root LabFlow product document.

**Related chapters:** `02_Technical_Architecture.md` defines how these product requirements are supported technically; `03_Core_Domain_Design.md` defines the shared business/domain rules; `04_Application_Modules.md` defines product-facing modules and workflows; `09_LabFlow_Licensing_and_Subscription_Architecture.md` defines Offline / Enterprise licensing architecture; `10_Product_Tiers_and_SaaS_Scope.md` defines the commercial/deployment tier model.

**Historical context:** the earliest LabFlow requirements originated from a small single-laboratory offline deployment. Those requirements remain useful product-domain history but no longer define the scope, scale, deployment topology, commercial model, or future boundaries of LabFlow.

**Future extensions:** product scope, tier entitlement boundaries, deployment requirements, non-functional targets, and commercial packaging should be revisited as LabFlow moves through SaaS and Offline / Enterprise productization.

**Remaining open questions:** implementation-level and commercial decisions continue to be tracked in the documentation set and Decisions Log. A decision is not considered implemented merely because supporting schema or architecture exists.
