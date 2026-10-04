# Repository Instructions

For every change made in this repository, append a dated entry to the root file `ENGINEERING_HISTORY.md` before finishing the task. Use Asia/Karachi dates and record affected files, what changed and why, validation results, and any deliberately unchanged issues or limitations. Preserve existing entries and distinguish completed work from future plans. Do not record secrets or credentials. Read-only investigations do not require a change-log entry.

## Targeted Engineering and Validation Policy

Use proportionate investigation and testing for every task.

### Investigation

Start with targeted file discovery based on the requested change.

Prefer:
- specific directories
- specific symbols/functions
- specific call sites
- relevant tests
- `git diff`

Do not scan or audit the entire repository unless the requested change or discovered dependencies genuinely require it.

Expand investigation only when evidence shows the change crosses additional boundaries.

### During implementation

Run the smallest useful validation first.

Prefer:
- affected unit tests
- affected integration tests
- targeted database tests
- relevant component/route tests
- targeted build/typecheck

While fixing a failure, rerun only the affected validation unless the fix changes a wider surface.

Do not repeatedly rerun the full historical test suite during development.

### Broader regression

Run one broader regression near completion only when justified by the risk or scope of the change.

Broader regression is normally justified for changes involving:
- authentication or authorization
- security boundaries
- billing or financial calculations
- database migrations, constraints or integrity
- concurrency, locking or idempotency
- destructive operations
- backup or restore
- shared infrastructure used across many modules
- changes that touch many modules

For localized UI/layout/copy changes, isolated frontend behavior and other low-risk changes:
- run targeted validation
- run the relevant build/typecheck
- do not automatically run all historical tests

Do not run unrelated tests merely to increase the reported test count.

Validation should provide confidence proportional to the risk of the change, not become a ceremonial full-suite exercise.

If a broad regression is run, record briefly why it was justified.

This policy applies to future Codex work unless the user explicitly requests exhaustive validation.
