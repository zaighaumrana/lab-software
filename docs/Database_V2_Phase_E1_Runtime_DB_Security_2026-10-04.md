# Database V2 Phase E1 — runtime database security

Completed 2026-10-04 (Asia/Karachi) on `development`, starting from committed D2
`c57d0f1`. This phase adds database runtime isolation and the authorized tenant
SMS master setting. No application schema change, new migration, dependency
upgrade, seed, business-data repair, commit or push was performed.

## Identity and environment boundary

The existing local `lms_v2` identity remains database/schema/object owner for
Prisma migration and maintenance tools. The API uses `labflow_app`: LOGIN,
NOSUPERUSER, NOCREATEDB, NOCREATEROLE, NOREPLICATION, NOBYPASSRLS, NOINHERIT;
no role memberships or application-object ownership. Application operators
continue using existing LabFlow authorization; every API process uses the
restricted infrastructure identity beneath that authorization.

- `DATABASE_URL`: owner tooling, loaded by unchanged `prisma7.config.ts`.
- `PROVISION_DATABASE_URL`: installation/admin tooling, needed for role creation.
- `RUNTIME_DATABASE_URL`: API runtime only.
- `apps/api/.env.runtime`: ignored runtime/provider environment. Normal API
  startup loads this file, never the owner/admin tooling environment.
- `packages/database/.env`: ignored owner/admin tooling environment, retained.

Production always enforces isolation. `DB_RUNTIME_MODE=hardened` enables the
same startup checks outside production. A missing runtime URL fails clearly.
An explicit externally supplied `DB_RUNTIME_MODE=development` permits the old
owner fallback only outside production and selects legacy development env files;
setting that flag solely inside an as-yet-unloaded owner file cannot select it.
Explicit connection-string injection remains supported for fixtures and seed
tooling; seed was not run. Production service accounts must be denied OS access
to owner/admin files. OS ACL/service-account installation is deferred.

## Grant policy and native functions

The target database loses PUBLIC CREATE/TEMP and the application schema loses
PUBLIC CREATE. Runtime receives CONNECT and schema USAGE; ordinary tables receive
SELECT/INSERT/UPDATE/DELETE; sequences receive USAGE/SELECT, never ownership or
UPDATE. Runtime has no `_prisma_migrations` privileges and no table
TRUNCATE/REFERENCES/TRIGGER grants. No other database's PUBLIC defaults change.

Audit logs, notification attempts, payments, invoice adjustments, report-version
results and frozen definition/version children have SELECT/INSERT only.
`report_versions` retains UPDATE for legitimate artifact/print metadata but no
DELETE. `test_versions` additionally permits UPDATE of `id` solely for native
normalization's row lock: PostgreSQL requires UPDATE on at least one column for
that lock; the existing guard rejects even `id=id`. Positive release tests and
negative mutation tests verify this exception. Existing guards remain necessary
where legitimate runtime transitions require table UPDATE.

Application function EXECUTE is revoked from PUBLIC and runtime, then explicitly
allowlisted:

| Classification | Function signatures |
| --- | --- |
| Direct runtime calls | `phase_a_visit_accession(text,text,timestamp with time zone)`, `phase_a_capture_test(text,"DefinitionCaptureSource")`, `phase_a_capture_package(text,"DefinitionCaptureSource")`, `phase_a_materialize_invoice(text,boolean)`, `b2_capture_report_version(text,text)` |
| Nested invoker call | `b1_normalize_definition(text)`; required by the normalization trigger's nested PERFORM |
| Trigger entry points | Remaining 23 native functions; no direct runtime EXECUTE. Actual trigger paths remain functional and protected by their owner. |
| Admin/migration only | No separate existing native function in this class. A disposable future admin-only function proves EXECUTE denial. |

All 29 native functions remain SECURITY INVOKER and owner-owned; none was
rewritten as SECURITY DEFINER. Extension-owned functions are excluded from
application-function revocation. PostgreSQL distinguishes trigger installation
privileges from existing trigger execution; exercised app writes prove the
revoked direct EXECUTE policy does not disable native guards. See official
[privilege rules](https://www.postgresql.org/docs/current/ddl-priv.html) and
[trigger requirements](https://www.postgresql.org/docs/18/sql-createtrigger.html).

Owner default privileges grant ordinary future table DML and sequence
USAGE/SELECT. Global function PUBLIC EXECUTE is revoked for that owner in this
database; a schema-only revoke cannot undo a global default. Future functions
require explicit review/allowlisting. Each deployment reapplies the deterministic
policy, including immutable-table exceptions. Defaults only cover objects
created by the verified owner, not another administrator identity. See
[ALTER DEFAULT PRIVILEGES](https://www.postgresql.org/docs/current/sql-alterdefaultprivileges.html).

## Read-only startup check

`PrismaService` connects, then inspects PostgreSQL catalogs/privileges in
production/hardened mode. It rejects dangerous role attributes, memberships,
database/schema/relation/function ownership, database CREATE/TEMP, schema CREATE,
table TRUNCATE/TRIGGER/REFERENCES, migration-table INSERT and permission to set
`session_replication_role`. Failure closes its existing client/pool and reports
a credential-free error. Normal startup never attempts ALTER/DROP operations.

## Windows provisioning and deployment

The reusable PowerShell/Node helper verifies the owner connection before making
changes, uses installation/admin access for roles/grants, generates a random
runtime password unless privately supplied, derives its SCRAM verifier locally,
and verifies actual runtime login and catalog checks before writing the ignored
API environment. No plaintext password is placed in SQL or command arguments;
no credentials are printed. Existing runtime/provider values are preserved and
owner/admin variables are excluded from the runtime file.

Run from the repository root with owner/admin configuration privately supplied:

```powershell
# Optional initial private admin setup; no roles or grants change here.
.\scripts\provision-runtime-db.ps1 -ConfigureAdminConnectionOnly

# Owner migrations, then initial login/provisioning and runtime verification.
pnpm --filter @lms/database migrate:deploy
.\scripts\provision-runtime-db.ps1

# Later deployments: migrate first, reapply grants without password rotation.
pnpm --filter @lms/database migrate:deploy
.\scripts\provision-runtime-db.ps1 -GrantsOnly

# Start API using only its runtime environment.
pnpm dev:api
```

Initial normal provisioning creates or updates the login and may rotate its
password; coordinate API process restarts for an intentional rotation. Use
`-GrantsOnly` for repeat grant verification without rotation. An existing role
name is derived from the saved runtime URL unless explicitly configured, and
the verification login must match the role receiving grants. An existing role
with ownership or memberships is rejected for explicit administrator review.
Generated passwords are ASCII; privately supplied passwords should also use
ASCII to avoid differing Unicode SCRAM normalization. Keep deployment secrets
out of Git and service logs. PowerShell parsing of the helper and setup passes.

## Optional SMS provider

Existing `SmsTemplate.isActive` is an event/template toggle, not a gateway master
toggle. The new existing-Configuration JSON key `sms_provider` stores only
`enabled` and provider identifier. An absent row defaults to enabled SENDPK to
preserve existing installations; malformed persisted settings fail closed.
SENDPK is the only implemented/selectable provider. The central gateway selector
is the extension point for future implementations; no fake choices are shown.

Admin Settings → Optional features always exposes Enable SMS. When off, normal
SMS navigation, provider details, templates and synchronization disappear.
Settings refresh on window focus and after actions; PostgreSQL is authoritative
even with stale UI. Server intent creation, dispatch, retry, template writes,
synchronization and delivery polling independently check the current setting.
Tenant locks serialize configuration and dispatch authorization consistently.

Disabling cancels QUEUED/RETRYING and safely claimed pre-dispatch SMS as
ABANDONED/PROVIDER_DISABLED with transactional audit, preserving frozen payloads
and history. No new automatic intent, provider request or automatic retry starts
while disabled. Already authorized/in-flight requests cannot be recalled;
uncertain D2 evidence retains its conservative policy. Re-enable affects new
events and never automatically resurrects abandoned work; existing safe explicit
manual retry remains available. Historical sent rows/attempts/templates are not
rewritten. Provider secrets remain server-side; configuration audits contain
safe before/after metadata only. Clinical, billing and reporting workflows stay
independent of this optional side effect.

## Validation and operational result

- E1: 10/10 focused groups pass, including actual Nest HTTP app transactions
  using restricted credentials only, auth/session, booking/patient, invoice and
  payment, sample/result/release/report capture, settings/audit and mocked SMS
  dispatch. Disposable non-superuser owner migrations pass. Runtime migration,
  role/database DDL, protected ALTER/DROP/TRUNCATE, trigger/function replacement,
  audit/attempt mutation, guard bypass and arbitrary/temp objects are denied.
  Allowlist/default future grants and deliberately unsafe startup are tested.
- SMS: 8/8 focused groups pass, including stale real HTTP calls, leased queue
  cancellation, independent worker recheck, rendered Settings UI visibility,
  no automatic resurrection, retained historical rows and secret-free audit.
- Existing: API 25, shared 19, database unit 4, B1 9, B2 9, C 11, D1 18, D2 11,
  ORM 5 and built API smoke 1: 112 distinct existing cases, 130 total with new
  focused groups. Initial API lifecycle fixture needed explicit runtime env;
  its failed case was corrected and passed in isolation after the other 24
  passed. Shared's initial parallel worker-exit warning disappeared in an
  isolated handle-detection run. No exhaustive Phase A rerun.
- Generate/validate, four workspace builds/typechecks and final API rebuild/
  typecheck pass. Prisma CLI/client/adapter stay 7.10.0, pg 8.23.1; timestamp
  adapter and lockfile remain unchanged. Disposable pools close cleanly.
- Disposable proof completed before operational privileges changed. Operational
  owner migrate deploy found all 14 migrations applied and no pending work.
  Initial provisioning and repeat grants-only verification passed; owner access
  remains working. A production `PrismaService` read-only startup probe loaded
  only the isolated API environment and passed as `labflow_app`: zero
  memberships, owned relations/functions and dangerous attributes/CREATE/TEMP.
- All 45 application table counts and existing-row fingerprint are identical
  before/after: `90ee7908c149e9535f5491badb398a9d735f7860daf55d8e1e7cf76f0652ee84`.
  All 14 original migration SQL files and migration lock retain their hashes;
  business schema source diff is empty and supported live Prisma diff reports
  no difference. No operational business rows, SMS settings, templates,
  consent or credentials of application users were changed; no real SMS sent.
- No API listener was found on local port 3000; no operational API process was
  restarted. Its next normal start loads the restricted runtime environment.

## Deliberately retained limits

Owner/admin credentials still intentionally bypass runtime restrictions and
must be restricted to maintenance. PostgreSQL LOGIN roles can change their own
password; administrative role changes and other roles remain denied. This is
database-local infrastructure isolation, not SaaS/RLS or protection against a
compromised owner/OS account. Future migrations must use the verified owner and
post-migration helper. Runtime startup inspection targets the application schema.

Backup/restore and recovery exercises remain E2. Cloud/bridge, certificate or
Kerberos auth, full Windows installer/service-account ACL rollout, new SMS
providers, notification reconciliation UI, clinical/financial redesign,
identifier/timestamp conversion and dependency upgrades remain deferred.
Existing dependency advisories are unchanged, not newly audited in E1.

Prior small-process Prisma 7 RSS increase (112–124 MiB versus about 51 MiB)
remains documented. This pass's larger API smoke measured 257.25 MiB and
10,117.16 ms startup under parallel host load; it is not a comparable benchmark.
No duplicate runtime client/pool or shutdown connection leak was found, so no
memory redesign was made. Existing pg concurrent-query/Node VM warnings remain.
