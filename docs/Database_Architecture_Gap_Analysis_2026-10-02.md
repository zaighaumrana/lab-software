# LabFlow database architecture gap analysis — 2026-10-02

**Status: investigation only; no V2 implementation authorized or performed.** Date: Asia/Karachi. Baseline: `development`, commit `f8f9285`; working tree was clean before investigation. The proposed remedies are in [Database V2 proposal](Database_V2_Proposal_2026-10-02.md). Priority expresses consequence, not evidence of an incident.

## Executive assessment

**Safe enough to evolve, with urgent clinical and financial corrections required before dependable production use.** The relational foundation is useful: separate patient, catalog, invoice, payment, specimen, result header/value and report records; foreign keys; Decimal amounts; sale-price and doctor-rate snapshots; tenant keys; explicit save/finalize operations; and an amendment predecessor relationship. A reset or replacement of PostgreSQL/Prisma is unwarranted.

The highest risks are application invariants that the database does not enforce: incompatible reference ranges can win selection; finalized history can be overwritten through reopening; current PDFs can contain superseded results; result/order/specimen identifiers can be combined without validating their shared context; and readiness counts catalog test IDs rather than actual ordered work. Transaction wrappers alone do not prevent stale reads and lost payment updates.

This review targets the requested first deployment: one laboratory branch, fewer than 50 patients/day, a local server and LAN browsers. Existing product documents also discuss cloud tiers; their control plane, licensing, portals and corporate contracts are **not prerequisites** for this V2. Internet-independent local operation and the separate website boundary remain mandatory.

## Evidence, coverage and limits

Reviewed the 29 Prisma models and 20 enums, migration SQL and package/configuration boundary; database consumers across API services, controllers, DTOs, guards and analytics; the registration, catalog editing, sample/result, invoice/payment and report/print frontend workflows; shared phone/SMS utilities; database integration/smoke and API/shared test coverage; README, setup script, and architecture/tooling/testing documents. A repository-wide source inventory surveyed 165 non-generated files / 20,029 lines across API, web, shared and database source. Domain-critical services and workflow logic received detailed review; static UI styling and ancillary presentation were surveyed rather than treated as database behavior. Generated clients, dependencies and binary assets are not architectural source evidence.

Local PostgreSQL investigation used **`BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY`**, with `transaction_read_only=on` verified. Only metadata, counts and row hashes were collected; no patient/contact values, credentials or row contents were written to evidence. Temporary inventory/evidence lives outside tracked source in the system temporary directory. No operational write, migration application, seed, application workflow or setup script was executed.

| Observed database fact | Result |
|---|---|
| Server | PostgreSQL 18.4 on Windows; session TimeZone Asia/Karachi |
| Public tables | 29 application tables + `_prisma_migrations` |
| Applied migrations | Five, all finished, none rolled back |
| Indexes | 95 including primary/unique indexes and migration table index |
| Catalog constraints | 316 total including PostgreSQL 18 not-null entries; **zero CHECK constraints** |
| Database sequences | None |
| Extensions | Only `plpgsql` |
| Application dates/times | 82 timestamp-without-time-zone columns; migration metadata has three timestamptz columns |
| Internal IDs | Application TEXT CUIDs; no database-side ID default |
| Actual transactions | Patients, bookings, invoices/lines, payments, samples, results/values, reports, shares, shifts, notifications, audit, sync and configurations all empty |
| Reference/master data | Tenant 1; branch 1; users 2; doctor 1; tests 8; parameters 12; ranges 15; package 1; members 3; flags 6; SMS templates 2 |

Therefore there is **no evidence of actual historical clinical/financial corruption** in this database. Empty transaction tables cannot validate real-world correctness, backfill assumptions or performance at meaningful volume. Findings below are confirmed source/constraint weaknesses, with illustrative consequences; they are not claims that a patient was harmed.

Read-only Prisma database-to-schema comparison (`migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code`) returned an empty diff. Migration names correspond to initialization, outsourcing, print tracking, cash shifts and SMS mappings/idempotency. No unsupported checks, triggers, sequences or extra extensions were found that secretly supply the missing business guarantees. Prisma schema and applied structure agree; semantic weaknesses are not schema drift.

Additional read-only catalog checks found zero noninternal triggers and zero RLS policies. All five applied migration SQL checksums match repository files (allowing line-ending normalization). These checks do not substitute for future validation of newly introduced native DDL or populated migration fixtures.

## Top ten findings

| Priority | Finding | Risk / concrete trigger | Recommendation |
|---|---|---|---|
| P0 | Reference selector scores every range without excluding inapplicable ones | A male adult result can receive a female/child range; unknown age/sex still gets the highest candidate | Filter applicability first, require a unique applicable policy, preserve selected range/context, block ambiguous release |
| P0 | Reopen mutates the released row; later entry deletes its values | Release → reopen → edit destroys the previously released values and release attribution | Clone a new draft revision; retain the released original and immutable report version |
| P0 | Current report PDF includes SUPERSEDED and RELEASED results | After amendment, both old and new values appear as current results | Explicit report-version membership; current output references only the approved revisions |
| P0 | Result context and required-value checks are incomplete | Valid sample, test and invoice-line FKs can refer to unrelated work; partial CBC can be released | OrderedTest identity, scoped composite FKs, typed/required parameter validation under lock |
| P0 | Readiness uses sets/counts of catalog test IDs; packages are not expanded | Duplicate tests prevent completion; unrelated released IDs can satisfy count; package-only sale has no processing/report path | Materialize ordered occurrences and package composition at sale; compare each required occurrence |
| P1 | Payment totals are calculated from a read before the transaction | Two payments create two rows but last invoice update loses the other amount; duplicate retry charges twice | Invoice lock or Serializable+retry; operation idempotency; reconcile from immutable money movements |
| P1 | Patient phone is required and tenant-unique; IDs use count/existence checks | Family phone or no-phone patient cannot be represented; concurrent registration collides | Nullable nonunique normalized contact, deliberate identity confirmation, atomic counters and unique retry |
| P1 | Specimens have no ordered-test/container/recollection relationship | Hardcoded Blood collection after payment can be unsuitable; rejection replacement has no chain | One Sample per physical container; SampleTest link, requirement snapshot, append collection/rejection events |
| P1 | Cash totals ignore branch and shifts do not own payments | Two drawers/branches share tenant-wide time-window receipts; simultaneous open/close races | Required branch/drawer, opening float, explicit payment→shift, single-open partial unique and close lock |
| P1 | Audit and durable integration intent are not transactionally recorded | Important changes lack actor/reason/history; crash after commit can lose notification; sending delays response | Audit + notification/outbox insert in business transaction; background attempts and leases |

## Current schema scorecard

Scores are qualitative architecture/workflow maturity (10 = dependable for this scope), not security certification or numerical averages.

| Domain | Score /10 | Current strength | Major weakness | Risk | Recommended action |
|---|---:|---|---|---|---|
| Patient model | 5 | Stable IDs, optional CNIC/DOB, history relation | Required unique phone, implicit consent, no historical snapshot/merge | P1 | Shared/no-phone identities and encounter snapshot |
| Visit/order structure | 3 | Repeat bookings/invoices per patient | InvoiceLine substitutes for clinical order | P0 | Visit + OrderedTest |
| Catalog | 6 | Parameter/choice separation, active status | Live definitions; delete-and-replace parameters | P1 | Approved immutable definition versions |
| Reference ranges | 2 | Decimal bounds, sex/month fields | Incompatible selector, overlaps, missing context | P0 | Applicability/approval/version rules |
| Samples | 4 | Acceptance/rejection dates and tenant scope | No tube requirements, work mapping, recollection lineage | P1 | Container identity, links and events |
| Results | 3 | Decimal values, actor slots, predecessor FK | Reopen overwrite; incomplete/type/context checks; races | P0 | Immutable released revisions |
| Reports | 3 | Stable identifier, readiness and payment gate | Superseded output, live joins, no version/artifact/delivery | P0 | Version membership and events |
| Billing | 7 | Decimal sale/discount snapshots in transaction | No line XOR/checks, adjustments or separate order boundary | P1 | Retain snapshots; strengthen invariants |
| Payments | 4 | Separate receipts and supported methods | Stale totals, retry duplication, mutating refund representation | P1 | Locked ledger-like movements |
| Doctors/commissions | 6 | Rate/type snapshotted on invoice | Aggregate-only contributions, no payouts/reversal lifecycle | P1 | Contribution basis + settlements |
| Bookings | 5 | Source and guarded status vocabulary | Accepted DTO lines discarded; random codes; blurred visit | P2 | Structured requests and conversion |
| Notifications | 6 | Provider payload/status/segments, uniqueness | Synchronous attempts, no worker lease/retry schedule/history | P1 | Transactional queue + attempts |
| Users/auth | 5 | bcrypt, crypto tokens, fail-closed permissions | Memory sessions; stale roles/deactivation; no durable revocation | P1 | Hashed session storage and security epoch |
| Audit | 2 | Before/after/entity/actor columns and indexes | No API business audit writes found; no append-only enforcement | P1 | Transaction-coupled significant events |
| Sync/outbox | 3 | Provider-neutral event/payload foundation | No producer/worker/inbox/dedupe/version/ownership | P4 | Prepare contracts; implement only with bridge approval |
| Branch scoping | 4 | Tenant filters and many branch FKs | Separate FKs don't enforce same tenant; detail reads tenant-only | P2 | Validated deployment branch + consistent scoped relations |
| Indexes | 6 | Exact-key uniqueness and basic queue indexes | Date/sort/FK coverage gaps; contains searches need other plans | P3 | Measured workload-specific index plan |
| Constraints | 4 | PK/FK/unique protections | No checks, context guarantees or active-row uniqueness | P0/P1 | Targeted checks/composite FKs/partial unique |
| Data retention | 4 | Many required FKs restrict deletion | Draft/history distinction absent; actor/source SET NULL; no policy | P1 | Deactivate/cancel/reverse/retain versions |

## Existing model inventory — all 29 models

Disposition concerns the eventual V2, not edits in this phase. “Keep” means retain the table and its useful shape; global date-type policy and future referencing relations are separate migration concerns.

| Model | Purpose / important relations | Current problems | Disposition |
|---|---|---|---|
| Tenant | Organization; owns domain roots | Activation not checked throughout auth; not a SaaS control plane | Keep |
| Branch | Organization location; users/bookings/invoices/samples/reports | No same-tenant composite FK guarantee; defaults resolved repeatedly | Modify integrity keys |
| User | Login, role, optional branch; audit/shift actor | Employee/login collapsed but sufficient now; sessions stale | Modify security epoch; retain roles |
| Patient | Identity; bookings/company links | Phone identity, uncertain DOB, implicit consent, no merge tombstone | Modify |
| Doctor | Referrer; bookings and shares | Current rule mutable; identity/contact snapshots absent | Modify minimally |
| Company | Corporate identity and billing/sharing policy; invoices | Reserved workflows, discount bounds not checked | Keep dormant foundation |
| PatientCompany | Patient/company membership | Cross-tenant pairing possible; company-side FK index absent | Modify scoped integrity when enabled |
| Test | Sellable test; parameters, lines, results, package members | Clinical definition and sellable identity conflated | Modify; stable identity + TestVersion |
| TestParameter | Definition; choices/ranges/result values | Delete-and-replace fails once used; requiredness not enforced on release | Modify version parent |
| TestParameterChoice | Allowed value/label; parameter | Choice membership not enforced on result; useful existing structure | Retain; parent becomes versioned |
| TestReferenceRange | Applicability and bounds; parameter | Inclusive month bounds, no overlap/bounds checks, no selected-range reference | Modify |
| Package | Bundle identity/price; items and invoice lines | Composition not frozen or expanded | Modify; PackageVersion |
| PackageItem | Member of package | Nullable test and scalar nestedPackageId; no XOR/child FK/cycle control | Modify versioned membership |
| Booking | Appointment/request; patient/doctor/branch/invoice | companyId/homeCollectorId scalars; lines DTO unused; cancellation in notes | Modify; request rather than visit |
| Invoice | Financial header; unique booking, lines, receipts, report | Acts as encounter; cached totals race; no adjustments | Modify; Visit parent |
| InvoiceLine | Sale-price/discount snapshot; catalog and result relations | Both/no target possible; clinical work tied directly to billing | Modify; retain financial snapshots |
| Payment | Individual money receipt; invoice | No recorder/shift/idempotency; status describes invoice balance | Rework existing table as money movement |
| CashShift | Drawer reconciliation; tenant/open/close users | branchId lacks FK; no opening float/payment links/open uniqueness | Modify |
| Sample | Specimen/container approximation; invoice and results | No actual ordered tests, collector scalar, no recollection parent | Modify; Visit + SampleTest |
| Result | Test/sample header; invoice line, values, amendment predecessor | No active/revision unique; reopen loses history; context not enforced | Rework as result revision, retain table |
| ResultValue | Typed value approximation; result/parameter | Numeric+text both possible; no boolean/choice enforcement; range not saved | Modify |
| Report | One per invoice; branch/identifiers/print counters | No exact content version; generatedAt conflated; live identity/catalog joins | Modify; stable report + versions |
| DoctorShare | Invoice-level earned amount; doctor/invoice | Good rule snapshot; no per-work basis/payout/reversal trace | Rework contributions, retain legacy aggregates |
| Notification | Rendered outbound request and provider state | No retry lease/history; related ID soft reference; amendment dedupe scope | Modify queue fields |
| SmsTemplate | Admin text and approved provider mapping; tenant/key unique | Provider-variable JSON needs schema validation; template active default is sensibly false | Keep |
| SyncOutbox | Outbound event envelope; tenant | No event version/dedupe/schedule/lease; unused runtime | Modify later with bridge |
| AuditLog | Significant action with before/after/actor | No reason/request/branch/version or DB protection; unused runtime | Modify and wire later |
| FeatureFlag | Tenant/key boolean | Useful foundation; not full entitlement enforcement | Keep |
| Configuration | Tenant/key JSON | Flexible branding good; no branch scope/version/audit; branding+tenant writes non-atomic | Modify narrowly |

## Clinical integrity: confirmed behavior and required boundaries

### Range selection and values

Evidence: `apps/api/src/modules/laboratory/laboratory.service.ts:935–999`, particularly `pickReferenceRange` at 959–973. Every range is scored. A gender mismatch merely misses points; age mismatch merely misses points. A gender-specific out-of-age range may beat a universal range; with no eligible rows it still returns a row. Equal-score order is not a clinically approved tie-break. Age uses **today's server-local calendar**, clamps future DOB to zero, and uses whole months rather than specimen-time age. No method/instrument/clinical-sex context is captured. Unknown gender is not an explicit safe fallback.

This is distinct from the now-correct Decimal comparison precision: `Decimal(16,6)` measurements and Decimal bounds are beneficial, but arithmetic precision cannot make an incompatible range clinically valid. DTOs accept JS numbers, so source decimal strings may lose precision before storage; incoming decimal strings with validated scale are preferable. `decimalPlaces` is report display precision, not permission to round away meaningful stored values.

Entry validates supplied parameter IDs against the test but not all required parameters, declared value types, permitted choices, units or empty values. Numeric and text columns can both be populated. BOOLEAN has no dedicated representation and the current frontend numeric/text mapping does not supply a boolean value. Finalize reads a header only; invoice-level release checks existence by test ID, not parameter completeness. `releaseImmediately=true` is accepted under RESULT_ENTER; invoice-ready uses LAB_SAMPLE_MANAGE. Today LAB_OPERATOR has both permissions, so there is no present active-role privilege split to bypass, but future finer roles would make these routes an unsafe authorization boundary.

V2 needs clinician-approved applicability, immutable definitions, explicit unknown age/sex handling, typed values, requiredness and release context. This document supplies no medical reference numbers, pregnancy rules or automatic clinical interpretation policy. The laboratory's authorized clinical lead must approve those.

### Order membership, duplicates and packages

Evidence: billing service report creation only checks `resolvedLines.some(l => l.testId)`; catalog packages store membership but billing never expands it. Laboratory readiness at 225–247 and 861–928 mixes line counts with sets of released test IDs. Two occurrences of the same test can yield one set member and never complete under recomputation; quantity is ignored. Conversely, two unrelated released test IDs can reach the number of invoice test lines because recomputation checks cardinality rather than exact membership. Entry verifies the sample and catalog test within tenant but does not verify the submitted invoice line belongs to that sample's invoice, matches that test, or belongs to the same tenant. Individual FKs are not those guarantees.

The frontend chooses the **first** invoice line with the test ID (`LaboratoryPage.tsx:180–219`) and selects existing results by sample+catalog test, reinforcing this ambiguity. OrderedTest must be a distinct occurrence. Package inclusion and duplicate/repeat intent must be explicit; never infer clinical completion from billed line count.

### Specimens and history

Evidence: `VisitPage.tsx:196–284` sends separate create-booking, check-in, invoice, payment and sample requests. It auto-collects a single `Blood` sample after payment; a sample failure can leave a successful receipt but an apparent failed workflow. No tube or test requirement is consulted. Sample FKs point at invoice, not the work actually performed. The schema has RECOLLECTED but there is no systematic recollection endpoint/history link. Rejected specimen identity must remain, with a separate replacement container. Tests compatible with one container may share it; different requirements must use separate Sample records, determined by lab policy rather than a guessed CBC/HbA1c pairing.

Collection controller does not pass the available actor to `collectSample`; amendment controller also omits its actor. Other actor-like fields (collector, entered/released IDs) lack User FKs. Concurrent read-state-then-update transitions are not conditional; two operators can overwrite a rejection/acceptance or finalize a stale draft.

### Released results and reports

Evidence: reopen at laboratory service 656–692 changes RELEASED→ENTERED and clears release actor/time, embedding a reason in notes; entry at 451–468 then deletes/recreates all values on that row. That loses released content. The **separate** amend path at 728–847 creates a new Result pointing to its predecessor and supersedes the old one: preserve and strengthen this existing idea rather than add a redundant generic ResultVersion table.

`reporting.service.ts` detail retrieval includes RELEASED **and SUPERSEDED**; `printing/templates/report.template.ts` flattens every returned result. The authenticated tracking lookup only includes RELEASED, so these two internal outputs differ. Patient-facing PDF should never present the superseded and replacement measurement as simultaneous current findings. Current parameter/test names, patient/referrer demographics, branding and print layout are live joins; today's edits can change an old reprint. Required parameter FK RESTRICT means delete-and-replace catalog parameters fails once result values reference them; it is **not** proof that the current endpoint silently deletes those used historical values.

PDFs are generated in memory and returned, not durably saved by current runtime; `pdfPath` is presently a storage placeholder. Rendering precedes `markPrinted`, but a PDF request does not prove physical printing or patient handover. `markPrinted` overwrites printedAt every request despite the first-print comment, increments printCount, and provides no per-version actor/event. Browser HTML print surfaces also exist and are not reliable printer acknowledgments. COMPLETE/AMENDED/ARCHIVED plus fully paid gate current staff delivery/printing; partial readiness is not release. Archived currently counts as finalized. The authenticated tracking route returns directly from the service instead of applying the detail route's payment/value stripping. These are internal permission/policy inconsistencies, **not evidence of an exposed public website endpoint**.

## Financial integrity

Invoice creation atomically inserts invoice/line snapshots, pending report when eligible, booking conversion and doctor share. Decimal prices, discounts, total and rate snapshots are sound foundations. Catalog price changes do not recompute stored line prices. However unitPrice currently remains basePrice while manualDiscount is subtracted at line level, despite comments describing final-unit pricing; names/docs must be explicit. Quantity uses IsNumber/Min rather than integer validation, even though the DB column is Int. Both testId and packageId can be supplied: package price wins while both references survive. Manual discount reason is optional despite the DTO comment. There are no database bounds or formula checks.

`recordPayment` reads balance and computes new totals **before** `$transaction` (`billing.service.ts:320–383`). Example: due 100, two concurrent receipts of 60 both pass the 100 check and both persist; cached balance may show 40 instead of a credit/overpayment condition. Decimal does not prevent this race. No stable operation key distinguishes a retry from a second intentional payment. Booking/invoice/report uniqueness prevents some duplicates, but collisions surface without a robust retry transaction.

Current Payment refund fields mutate the original receipt representation and cannot clearly represent partial refunds or separate opposite money movement. Void/refund/write-off endpoints are unfinished, even though enum values and analytics functions exist. No writes should be inferred from those states. A small immutable receipt/refund/reversal structure with invoice adjustments is sufficient; double-entry ERP is unnecessary. Outstanding balance must reconcile to charges, adjustments and net receipts.

DoctorShare stores type/rate/calculatedAmount once, so a future doctor-rate edit does **not** recalculate old rows. PER_TEST_FIXED counts direct test lines, ignoring quantity and constituent package tests, and substitutes 1 for zero direct tests. Percentage uses grandTotal: that basis needs owner confirmation, not silent redesign. No per-test contribution, settlement rows or payout/reversal workflow exists. Analytics sum shares without consistent reversed-status treatment, and JS Number summaries can introduce presentation rounding. Outsourcing analytics attribute whole invoice lines per outsourced sample, potentially repeating revenue and labeling sample counts as test counts; actual SampleTest mapping is needed for exact measures.

CashShift schema comments describe tenant/branch windows, but service payment aggregation filters **tenant only**. Payments have neither branch directly nor shift nor recorder. Open checks are non-atomic; no partial uniqueness. Close aggregates outside its update transaction and has no conditional OPEN/version update. Opening float, refunds and paid-out cash are not represented. A closed shift should preserve a snapshot with explicit attributed movements; inclusive neighboring time windows are not reliable ownership.

## Identity, authentication, scope and traceability

Phone-first lookup is convenient but phone is not a person identifier. Patient DTO requires Pakistani mobile format and schema requires tenant-unique phone. Families, children and patients with no mobile cannot use it correctly. UI “register a new patient with this phone” is contradicted by backend uniqueness. CNIC is nullable/indexed, with application existence checks but no unique constraint; concurrent duplicates are possible. Do not invent CNIC for children/no-ID patients or auto-merge by phone/name. Birth date is stored as DateTime with no certainty/source/age-as-reported field. An immutable visit/report demographic snapshot prevents later corrections rewriting historical interpretation.

Patient LAB/MRC allocation uses `count + 1`, up to eight pre-insert existence probes (`patients.service.ts:32–54`), not insert-conflict retry. Deletions/gaps and simultaneous registrations undermine it. BK uses a 9,000-number daily random space with three existence probes; invoice/sample/report use 90,000 possibilities per UTC date with no atomic collision retry. Tracking uses 10 Math.random characters from a 32-character alphabet; a uniqueness constraint exists, but this is not a cryptographic public token. LAB/MRC are currently permanent patient identifiers; nothing establishes a distinct visit accession meaning for MRC. Owner must confirm that meaning before changing it.

Custom sessions and login attempts are in process Maps. Crypto random tokens and bcrypt are useful; a restart safely logs everyone out, but changes to isActive/role/password do not revoke existing snapshots. Idle TTL slides; sockets validate only at connection. Username query is unscoped while uniqueness is tenant-scoped. This is not a full SaaS boundary today; avoid describing it as one. Persist hashed tokens/expiry/revocation and a user security epoch for reliable revocation without speculative RBAC redesign. User suffices for current staff; a standalone Employee table is deferred until non-login staff management is required.

Controllers derive tenant from session, which is a real improvement over trusting headers. Branch fallback repeats `user.branchId || DEFAULT_BRANCH_ID || 'default-branch'`. Some lists filter branch; many by-ID reads filter tenant only. This may be an intentional organization-wide staff policy, but it is not branch isolation. Validate the configured branch and deny disallowed ownership changes. Independent tenant/branch/patient/doctor FKs can link objects across tenants; the database does not enforce shared scope. No need to introduce SaaS RLS as the first remedy for a single local tenant.

Repository-wide API scan found no `auditLog.create` or `syncOutbox.create` business producers. AuditLog's useful before/after columns do not make writes happen or protect them from modification. Reopen/cancel reasons in concatenated notes are not structured events. Operational recent activity is reconstructed from mutable timestamps, not a historical audit. Significant changes need actor, time, reason, request/correlation and scoped entity reference recorded **in the same transaction**, with redacted bounded snapshots and DB role protection. Never store passwords/session tokens/provider credentials there.

## Relation, uniqueness, deletion and type inventory

### Enum audit — all 20 enums

| Enum(s) | Current interpretation / concern |
|---|---|
| Role | Eleven reserved labels; only ADMIN and LAB_OPERATOR active. Keep fail-closed unactivated roles; no speculative role-table redesign |
| Gender | MALE/FEMALE/OTHER/UNKNOWN; identity and clinical applicability are conflated; unknown must not mean an arbitrary sex-specific range |
| ShareType | PERCENTAGE/FIXED_AMOUNT/PER_TEST_FIXED; calculation basis and quantity/package semantics need explicit policy |
| CorporateBillingMode, ResultSharingPolicy | Reserved corporate payer/disclosure policy; model presence is not implemented payment allocation or consent authority |
| ParameterValueType | NUMERIC/TEXT/BOOLEAN/CHOICE; boolean/choice/required validation is incomplete |
| BookingStatus, BookingSource | Six states/four origins; CONVERTED currently means invoice generated rather than encounter created; ONLINE source remains a local request label after website separation |
| InvoiceStatus | DRAFT/ISSUED/VOIDED/CLOSED/REFUNDED; CLOSED conflates paid balance with document lifecycle; refunds/voids not complete endpoints |
| PaymentMethod | CASH/BANK_TRANSFER/EASYPAISA/JAZZCASH/CARD/OTHER; labels do not prove gateway integration; cash-specific totals must actually filter CASH |
| PaymentStatus | Partial/full receipt follows invoice paid state, not state of a single settled money movement; VOIDED/REFUNDED/FAILED mostly future representation |
| CashShiftStatus | OPEN/CLOSED adequate; missing atomic transitions/ownership rather than need for many more states |
| SampleStatus | Ten states; RECOLLECTED/IN_TRANSIT/COMPLETED/DISCARDED vocabulary exceeds implemented transitions; specimen history must not mutate identity |
| ResultStatus, ResultFlag | Four result states/six flags; good release/supersession vocabulary, unsafe reopen path. NORMAL only meaningful against an applicable approved range, not a missing/incompatible policy |
| ReportStatus | PENDING/PARTIAL_READY/COMPLETE/AMENDED/ARCHIVED; readiness, amendment and archival mixed; no independent release/delivery evidence |
| ShareStatus | Six earnings/payout/reversal labels; payout/clawback/settlement lifecycle is not implemented just because enum exists |
| NotificationChannel, NotificationStatus | SMS active, WhatsApp/email future; six states but no automatic retry worker; SENT currently corresponds to provider acceptance, not delivery |
| SyncJobStatus | Six queue states with no runtime production workflow; future acknowledgement is transport receipt rather than clinical acceptance |

The proposal separates clinically/financially different facts while avoiding a separate enum for every UI action. Existing values require explicit compatibility mapping; no enum changed in this phase.

### Relational guarantees and gaps

Actual catalog confirms 54 FKs, 30 PKs including migration metadata, and existing unique indexes as represented by Prisma. Missing declared relations include PackageItem.nestedPackageId, Booking.companyId/homeCollectorId, CashShift.branchId, Sample.collectedById and Result.enteredById/releasedById. Notification.relatedId and sync/audit aggregate IDs are intentional polymorphic references, but need validated producers/snapshots, not fictitious universal FKs.

Every invoice/sample/result/report chain must agree on tenant, branch, visit, work and definition. In V2 use selected composite identity keys/FKs and transactional checks for cross-row state, not a broad assumption that any individually existing ID is acceptable. Composite FK null semantics matter: required scope columns must be nonnull; optional relationships permit explicit absence, not half-populated composite links.

Current unique scopes: Tenant.slug global; Branch.code, User.username, Patient.phone/labNumber/mrcNumber, Company.code, Test.code, Package.code, Booking.bookingCode, Invoice.invoiceNumber, Sample.sampleCode, Report.reportNumber/trackingId, SmsTemplate.key, FeatureFlag.key and Configuration.key tenant-scoped. Parameter.code is test-scoped; choice.value parameter-scoped; PatientCompany pair unique; ResultValue result/parameter pair unique; Invoice.bookingId and Report.invoiceId globally unique. Retain useful identifier/code scopes, remove phone uniqueness in a staged migration, add normalized confirmed-CNIC uniqueness only after deduplication, and retain nullable Company.code semantics. Notification's nullable composite unique intentionally exempts ad-hoc rows, but its entity/event key cannot represent each amended-report revision separately. Package members and active result/shift states lack uniqueness.

### Existing deletion behavior

Cascade edges: Test→TestParameter→choices/ranges, Package→PackageItem, Invoice→InvoiceLine, Result→ResultValue. Used parameters are restricted by ResultValue; used invoice lines are restricted by Result, so these chains can fail as well as cascade. An unreferenced issued invoice can still lose its lines on deletion. Optional catalog sources, doctor/company booking links, patient/user branches, audit actor, shift closer and amendment predecessor use SET NULL defaults in actual SQL. SET NULL may protect a parent deletion from failing but erase provenance. API has no general hard-delete workflow; these are database capabilities and future maintenance risks, not observed delete operations.

Retain patients with merge/deactivation tombstones; deactivate users/doctors/catalog/branches; cancel visits/orders/bookings; retain collected/rejected specimens and events; freeze released clinical records; correct issued invoices with adjustments; reverse receipts/commissions via opposite entries; append audit; retain finalized report versions/artifacts. Hard-delete only unused drafts/test fixtures, with checks preventing clinical/financial history deletion. Queue and auth housekeeping requires an owner-approved bounded retention policy. No Pakistan statutory retention period is asserted by this engineering review.

### Dates, numeric types, JSON and notes

PK TEXT CUIDs are already adequate; converting every existing ID to UUID would create risk without benefit. Money Decimal(12,2), share rates Decimal(10,2), reference bounds Decimal(12,4), result Decimal(16,6) are appropriate starting points; confirm lab-required maximum precision rather than automatically enlarge them. Int quantity must be a positive integer; attempts/counts nonnegative. Clinical DOB should be DATE with known/estimated status; instants should become timestamptz with explicit legacy conversion, not an implicit server timezone cast. Use UTC API instants, Asia/Karachi reporting-day boundaries, half-open `[start,nextDay)` filters; dates and identifier date prefixes must follow stated business timezone. Current `.toISOString()` UTC buckets coexist with local `setHours/getHours` and locale-dependent PDF formatting.

| Existing JSON field | Classification / recommendation |
|---|---|
| Configuration.value | Appropriate flexible settings, but per-key typed, versioned, bounded and schema-validated; exclude secrets |
| SmsTemplate.sendpkRequiredVariables | Appropriate provider contract snapshot; validate string array |
| Notification.providerVariables | Appropriate immutable transport payload; validate known event shape, limit/redact PII |
| SyncOutbox.payload | Appropriate versioned transport envelope; explicit schema/event ID and approved data only |
| AuditLog.before / after | Appropriate selective event snapshot; redaction/size/schema policy; never primary clinical history |

No current booking test-ID serialization into notes was found in active local frontend/API. Instead CreateBookingDto accepts lines which BookingsService ignores, and VisitPage sends selected tests to invoice creation separately. Older documents describing informal booking selection should not be mistaken for current behavior. Confirmed notes abuse is cancellation/reopen/amendment reason concatenation; free patient/sample/doctor notes remain legitimate bounded narrative fields. Clinically immutable report content may use a **typed immutable render snapshot** plus relational version membership; a giant mutable Visit JSON would be unsafe.

## Notification, offline/sync, files, settings and performance

Notification stores rendered body, provider template/variables, segment count, accepted/delivered timestamps and last response; retain these. Duplicate automatic requests are constrained. Nevertheless queue insertion occurs after sample/result commit, and `attemptSend` is awaited in the HTTP path with a 15-second network timeout. A crash between clinical commit and insert loses intent; DB/other post-commit failures can report an error despite a successful clinical write. RETRYING has no scheduled worker. Sending has no conditional lease/claim; manual retries can race. Consent defaults true at schema/service; UI registration does not capture explicit consent history. Recheck current consent before each future send, while preserving event-time basis.

Outbox exists but has no producer/worker. Future bridge should use local-approved immutable report revisions and public readiness metadata, and cloud booking **requests**, never overwrite operational clinical/financial rows. Transport is at least once; dedupe inbox/event IDs, lease with retry scheduling, quarantine incompatible payload versions. No distributed consensus or direct website→LAN/DB access. “Offline” means internet loss while local server/LAN remain reachable; browser workstations do not own independent authoritative databases. LAN/server/power failure requires recovery, not imaginary PWA synchronization.

PDFs are currently regenerated; changing live definitions/identity/layout can change old output. A future ReportVersion should preserve exact content and approval; save PDFs on local disk with portable relative key/hash/size/template version, backed up alongside database. A DB transaction cannot atomically commit an external file: use pending artifact state, temporary render, durable file rename, then registered hash; recover missing/pending artifacts and never expose an incomplete file. Backup must capture a consistent DB plus referenced files and schema/app versions. Verify restore on a separate machine; same-drive backup is insufficient. pg_dump/PITR, offsite/offline copies, encryption/key recovery, RPO/RTO and retention are deployment decisions, not implemented by a table name. setup.ps1 applies migrations and seeds without the future upgrade backup/approval orchestration; it was inspected, **not run**.

Branding/print JSON and inactive SMS mappings are useful. SendPK credentials stay in server environment today. Future branch settings need an explicit scope, with print/clinical policy snapshots; secret references can point to a protected deployment store, never generalized audit-visible JSON. Branding save performs Configuration upsert and Tenant update separately; future transactional update/audit is needed. Report PDF render uses a local reusable browser; no Prisma client duplication was identified. Preserve the documented Prisma 7 RSS increase (fresh ~112–124 MiB versus Prisma 6 ~51 MiB) and pool max 10; this audit neither rebenchmarked nor redesigned it.

Performance priorities at this scale: cap pending-sample/abandoned-notification lists; push doctor dashboard pagination/filtering into DB (currently loads all then slices); batch per-line catalog price lookup during invoice creation (currently N queries); avoid repeating full invoice/sample/result trees for each sample; consolidate repeated analytics scans without premature rollups. Doctor statement request asks for 1000 rows but dashboard clamps pageSize to 100, a completeness limitation. Existing take=200 invoice/report lists are bounded but need stable pagination. Contains/insensitive searches do not become efficient merely from ordinary B-tree indexes; exact normalized lookup first, optional trigram only after measured need. No representative EXPLAIN/latency claim is made on empty operational tables.

## Documentation discrepancies deliberately left unchanged

README still names PostgreSQL 16 and an absent scripts folder while actual server is 18.4. Doc 05 calls analytics unimplemented and says outsourcing fields missing; query modules/schema prove otherwise. Doc 12/13 describe an older three-test/no-integration state; Prisma 7 migration evidence records 54 checks including disposable DB/API coverage. Doc 04 descriptions of public endpoints/informal booking storage and older SMS administration status are partially outdated after website separation/SMS work. Installer text describing static serving is a target, not proven by current AppModule (no ServeStatic module). These documents were not rewritten in this narrowly authorized two-document analysis; new reports identify the distinctions instead of inheriting their claims.

## Validation for this documentation phase

No builds/domain tests were rerun because no executable, dependency or generated source changed; running operational workflows would undermine this read-only phase. Existing Prisma 7 evidence's 54 passing tests is a historical baseline, **not a new V2 acceptance result**. Those tests verify adapter precision/transactions, basic billing/results/auth/socket and permissions/SMS utilities; they do not cover incompatible ranges, amendments, concurrent payment/identifier/state races, packages, cash ownership or V2 backfills. Proposed tests are specified in the companion proposal.

Final validation: documentation-only Git changes; `git diff --check` clean; schema and migration Git diffs empty; all 30 table count/content fingerprints and metadata fingerprints unchanged across the read-only investigation. No commit, push, branch creation or history manipulation performed.

## External technical/quality references

PostgreSQL supplies row checks, foreign keys and partial uniqueness; cross-row sums require transactions rather than a row CHECK. FK columns need workload-appropriate indexes, not an assumption of automatic indexing. [PostgreSQL 18 constraints](https://www.postgresql.org/docs/18/ddl-constraints.html).

Prisma 7 can use transactions and configured isolation, but database-native constraints outside the schema language require reviewed SQL migrations and explicit regression checks. [Prisma 7 database feature matrix](https://docs.prisma.io/docs/orm/v7/reference/database-features), [Prisma 7 transactions](https://docs.prisma.io/docs/orm/v7/prisma-client/queries/transactions).

Instant/date separation and explicit legacy interpretation follow PostgreSQL's timestamp/date semantics. [PostgreSQL 18 date/time types](https://www.postgresql.org/docs/18/datatype-datetime.html).

Laboratory quality policy should govern authorized result review, records and corrections; this is engineering analysis rather than a clinical-policy substitute. [WHO laboratory quality management handbook](https://www.who.int/publications/i/item/9789241548274).
