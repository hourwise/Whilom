# Whilom stack promotion runbook

This is an owner-authorized future runbook. It is not an instruction to merge
the stack in Batch 21A.5. The audited source tip is
`765d8044c9935f56aaa966c2552b4ffd55cdbae6` on
`codex/whilom-backend-readiness`.

## Selected method

Use one dedicated integration PR from a new branch created at the approved
final tip into `main`. Preserve the batch commits; do not squash. Leave PRs
#10–#20 and their existing bases untouched until the integration PR is merged.

## Owner sequence

1. Verify the expected current heads for PRs #10–#20, the two Batch 14/15
   lineage branches, and the approved final source SHA. Stop if any head moved,
   a base changed, or the final tip is not a descendant of `main`.
2. Freeze new writes to all stack branches for the duration of promotion. Do
   not add commits to `codex/whilom-backend-readiness` or an earlier batch branch.
3. Run final focused/current validation on the exact source tip: migration
   syntax and inventory, pgTAP plan checks, backend contract checks, ingestion
   TypeScript and governance suites, web TypeScript/tests, workflow validation,
   and `git diff --check`. Do not run national-scale workloads solely for this
   promotion.
4. Create a dedicated integration branch at the approved source SHA and open
   one integration PR with base `main`. Review the complete `main..tip` diff,
   confirm the 42-migration chain, and require current CI on that PR.
5. Merge the integration PR using the repository's approved non-squash method.
   A normal merge commit or fast-forward is acceptable according to repository
   policy; do not sequentially merge the stacked PRs into their development
   bases as a substitute for this integration checkpoint.
6. Verify the resulting `main` SHA and record it alongside the approved source
   SHA, integration PR number, reviewer/owner, and UTC timestamp.
7. On resulting `main`, verify migration files are exactly `0001`–`0042`, the
   machine-readable inventory matches, and the current CI/workflow/pgTAP,
   ingestion, web, generated-type, and backend-contract checks are green.
8. If repository conventions support it, create an annotated tag or committed
   checkpoint record for the backend-bootstrap source. The record must identify
   the immutable main SHA, not only a branch name.
9. Only after steps 1–8 pass, create/link the new Whilom Supabase project. Record
   the owner-approved project ref and region, and prove the project is new and
   empty before applying anything.
10. Use that exact recorded main SHA as the source checkpoint for Batch 21B.
    Batch 21B must not silently switch to a later moving branch.

## Stop conditions

Stop promotion immediately if:

- any expected PR head or base changed after verification;
- the source is not exactly the owner-approved SHA, or is not a descendant of
  the current `main` checkpoint;
- any required current check is missing, stale, failing, or skipped without an
  explicit policy justification;
- migration count, order, names, bytes, or digests differ from the sealed 42-file
  inventory;
- pgTAP, ephemeral replay, generated types, RLS/public-discovery checks,
  ingestion, web, or backend-contract checks fail;
- the integration diff contains an unexpected merge, unrelated file, or
  functional remediation not separately reviewed;
- the hosted project ref is wrong, non-empty, already linked to another
  application, or has unexplained migrations, users, rows, or storage objects;
- any command would deploy to hosted Supabase, load data, publish data, or use
  national-scale workloads outside an explicitly authorized lane.

## Handoff record

The owner should record:

```text
approved_source_sha = <immutable Batch 21A tip>
integration_pr      = <PR into main>
resulting_main_sha  = <immutable promoted checkpoint>
migration_inventory = 42 files, ordered and hash-matched
ci_status           = current green on resulting main
hosted_project_ref  = <new/empty Whilom project ref>
backend_source      = resulting_main_sha
```

No hosted Supabase project is created or linked by this audit.
