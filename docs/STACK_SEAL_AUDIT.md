# Whilom stacked integration readiness audit

Batch 21A.5 — stack seal + mainline integration readiness

Audit date: 2026-08-20

Repository: `hourwise/Whilom`
Audit source tip: `codex/whilom-backend-readiness` at
`765d8044c9935f56aaa966c2552b4ffd55cdbae6`

This is a read-only governance audit of the existing stack. It did not merge,
close, retarget, rebase, or force-push any earlier PR; did not modify `main` or
an existing batch branch; did not access hosted Supabase; did not deploy a
migration; and did not publish data.

## Result

`STACK_TOPOLOGY = CLEAN_LINEAR`

The open chain from PR #10 through PR #20 is linear at the Git commit level.
The two unnumbered lineage branches between PR #13 and PR #14/#15 are present,
are descendants of the preceding head, and contain the expected Batch 14 and
Batch 15 evidence commits. There is no missing open PR in the requested chain,
no non-descendant transition, no duplicate commit range, and no migration file
present only on an abandoned local/origin branch.

`MIGRATION_CHAIN = CONTINUOUS`

The current tip contains exactly `0001` through `0042`, with no duplicate
numbers, conflicting names, or inventory drift. The committed inventory checker
also matches all 42 file digests and byte counts.

`TEST_GOVERNANCE = INTACT`

No test, SQL test, or workflow file was deleted across `main..765d804`. The
pgTAP plan total grew from 251 assertions on `main` to 429 at the tip. Small
deletions in modified tests are legitimate supersession: the Iron Age boundary
was corrected from `-43` to `42`, the parity test now evaluates the effective
registry after its corrective migration, and matcher/temporal tests were
extended rather than weakened. No materially weaker replacement was found.

`CROSS_BATCH_FINDINGS`

- `BLOCKING`: none found in the integrated tip.
- `NON_BLOCKING`: PR #18's current head has a failed app check caused by an
  unused `stages` parameter in `controlled-summary.ts`; PR #19 removes that
  parameter, and PR #19/#20 current heads are green. PR #18 therefore remains
  historically failed/currently stale as an individual head, but does not
  describe the expected integrated tip.
- `STALE_DOC_ONLY`: the short README and architecture summaries still describe
  the scale lane as ending at 25,000 while the chronological scale evidence
  records the later governed `PROVEN_SAFE_TO_50K` result. This does not change
  runtime behavior or the sealed migration chain; update it in a bounded
  documentation follow-up rather than in this audit.

`BACKEND_SOURCE_CHECKPOINT = READY_TO_SEAL`

This means the repository stack has no topology or static governance blocker to
owner promotion. It does not mean that the stack has been promoted or sealed.
The owner must still create the mainline checkpoint, rerun current validation on
the resulting main, record the resulting SHA, and confirm a new/empty hosted
project before Batch 21B may link anything.

## Stack topology

The intended topology, including the two lineage-only branches, is:

```text
main @ 159a154f7c9eec79f0327a022981a9bea512bf81
  |
  +-- PR #10  codex/whilom-discovery-time-people @ 7f65e54540352ab8e09ddd7fc36d5452b58c29ae
       |
       +-- PR #11  codex/whilom-temporal-evidence @ 21746b751443f8d9ac62090290bcc818692c549b
            |
            +-- PR #12  codex/whilom-coverage-recon @ 6a18d00876530318102d15bdc6183e743e7308d5
                 |
                 +-- PR #13  codex/whilom-national-pilot @ 7c0afc1e6ea19795fc16d192b91f7d2e31873cc7
                      |
                      +-- Batch 14 lineage  codex/whilom-national-scale-remediation @ d2ebaf6cda75dabffc3e95e7fd834beb69a1161b
                           |
                           +-- Batch 15 lineage  codex/whilom-national-locality-remediation @ 51c09ee2bc8975d3efe7529ac0e28dc6a01ec911
                                |
                                +-- PR #14  codex/whilom-national-matcher-remediation @ 8a25a0fbd18b567b0a4177280c39e730061d37f7
                                     |
                                     +-- PR #15  codex/whilom-national-radius-pruning @ b50e4465fac0257cb8958b17b37010b20e36e587
                                          |
                                          +-- PR #16  codex/whilom-national-register-pruning @ 1048d3ccc5120999a62f24b9f12dff042ffd73ac
                                               |
                                               +-- PR #17  codex/whilom-national-workload-audit @ 0f38567de1e1c34d9a4d9a75ce214d9bf2739d35
                                                    |
                                                    +-- PR #18  codex/whilom-composition-controlled-scale @ ccaad32b2b45d7e5845510b4cc822cbb2e004a1c
                                                         |
                                                         +-- PR #19  codex/whilom-scale-governance @ fc3098ee05ba9a5383f7d2e6662bc7cf0cc2cadb
                                                              |
                                                              +-- PR #20  codex/whilom-backend-readiness @ 765d8044c9935f56aaa966c2552b4ffd55cdbae6
```

Every row below was observed open, draft, and `MERGEABLE` on GitHub at audit
time. `merge-base` is the exact Git merge-base of the listed base and head;
`descendant` means the base is an ancestor of the head. Unique commits are
`base..head`.

|  PR | Title                                                                                         | Base branch / SHA                                                                         | Head branch / SHA                                                                        | Draft / state / mergeable | Unique | Merge-base                                 | Descendant |
| --: | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------- | -----: | ------------------------------------------ | ---------- |
|  10 | WHERE — WHEN — WHO: UK map homepage, century ruler, and people discovery                      | `main` / `159a154f7c9eec79f0327a022981a9bea512bf81`                                       | `codex/whilom-discovery-time-people` / `7f65e54540352ab8e09ddd7fc36d5452b58c29ae`        | yes / OPEN / MERGEABLE    |     15 | `159a154f7c9eec79f0327a022981a9bea512bf81` | yes        |
|  11 | Defensible temporal coverage: an evidence model, and dates that say only what the source said | `codex/whilom-discovery-time-people` / `7f65e54540352ab8e09ddd7fc36d5452b58c29ae`         | `codex/whilom-temporal-evidence` / `21746b751443f8d9ac62090290bcc818692c549b`            | yes / OPEN / MERGEABLE    |     13 | `7f65e54540352ab8e09ddd7fc36d5452b58c29ae` | yes        |
|  12 | National coverage reconnaissance: measure every source, import only what survives             | `codex/whilom-temporal-evidence` / `21746b751443f8d9ac62090290bcc818692c549b`             | `codex/whilom-coverage-recon` / `6a18d00876530318102d15bdc6183e743e7308d5`               | yes / OPEN / MERGEABLE    |      6 | `21746b751443f8d9ac62090290bcc818692c549b` | yes        |
|  13 | National scale pilot + temporal conflict governance                                           | `codex/whilom-coverage-recon` / `6a18d00876530318102d15bdc6183e743e7308d5`                | `codex/whilom-national-pilot` / `7c0afc1e6ea19795fc16d192b91f7d2e31873cc7`               | yes / OPEN / MERGEABLE    |      8 | `6a18d00876530318102d15bdc6183e743e7308d5` | yes        |
|  14 | Batch 16 — national matcher threshold diagnosis + remediation                                 | `codex/whilom-national-locality-remediation` / `51c09ee2bc8975d3efe7529ac0e28dc6a01ec911` | `codex/whilom-national-matcher-remediation` / `8a25a0fbd18b567b0a4177280c39e730061d37f7` | yes / OPEN / MERGEABLE    |      3 | `51c09ee2bc8975d3efe7529ac0e28dc6a01ec911` | yes        |
|  15 | Batch 17 — exact-radius candidate pruning + national scale proof                              | `codex/whilom-national-matcher-remediation` / `8a25a0fbd18b567b0a4177280c39e730061d37f7`  | `codex/whilom-national-radius-pruning` / `b50e4465fac0257cb8958b17b37010b20e36e587`      | yes / OPEN / MERGEABLE    |      3 | `8a25a0fbd18b567b0a4177280c39e730061d37f7` | yes        |
|  16 | Batch 18 — same-register pre-hydration pruning + scale proof                                  | `codex/whilom-national-radius-pruning` / `b50e4465fac0257cb8958b17b37010b20e36e587`       | `codex/whilom-national-register-pruning` / `1048d3ccc5120999a62f24b9f12dff042ffd73ac`    | yes / OPEN / MERGEABLE    |      3 | `b50e4465fac0257cb8958b17b37010b20e36e587` | yes        |
|  17 | Batch 19A — national workload composition audit                                               | `codex/whilom-national-register-pruning` / `1048d3ccc5120999a62f24b9f12dff042ffd73ac`     | `codex/whilom-national-workload-audit` / `0f38567de1e1c34d9a4d9a75ce214d9bf2739d35`      | yes / OPEN / MERGEABLE    |      2 | `1048d3ccc5120999a62f24b9f12dff042ffd73ac` | yes        |
|  18 | Batch 19B — composition-controlled national scale benchmark                                   | `codex/whilom-national-workload-audit` / `0f38567de1e1c34d9a4d9a75ce214d9bf2739d35`       | `codex/whilom-composition-controlled-scale` / `ccaad32b2b45d7e5845510b4cc822cbb2e004a1c` | yes / OPEN / MERGEABLE    |      2 | `0f38567de1e1c34d9a4d9a75ce214d9bf2739d35` | yes        |
|  19 | Batch 20 — national scale benchmark governance                                                | `codex/whilom-composition-controlled-scale` / `ccaad32b2b45d7e5845510b4cc822cbb2e004a1c`  | `codex/whilom-scale-governance` / `fc3098ee05ba9a5383f7d2e6662bc7cf0cc2cadb`             | yes / OPEN / MERGEABLE    |      2 | `ccaad32b2b45d7e5845510b4cc822cbb2e004a1c` | yes        |
|  20 | Batch 21A — backend bootstrap readiness + PostGIS query contract                              | `codex/whilom-scale-governance` / `fc3098ee05ba9a5383f7d2e6662bc7cf0cc2cadb`              | `codex/whilom-backend-readiness` / `765d8044c9935f56aaa966c2552b4ffd55cdbae6`            | yes / OPEN / MERGEABLE    |      2 | `fc3098ee05ba9a5383f7d2e6662bc7cf0cc2cadb` | yes        |

The unique counts sum to `TOTAL_STACK_COMMITS = 64`. The ranges are adjacent,
so no commit is duplicated between successive PR deltas. No unexpected merge
commit or history rewrite appears in the chain.

## Main-to-tip delta

Compared with `main` at `159a154f7c9eec79f0327a022981a9bea512bf81`, Git measures:

```text
TOTAL_STACK_COMMITS       64
TOTAL_STACK_FILES_CHANGED 118
TOTAL_STACK_ADDITIONS     23977
TOTAL_STACK_DELETIONS     1438
```

| Subsystem                             | Files | Additions | Deletions | Owner summary                                                                                                                                                                       |
| ------------------------------------- | ----: | --------: | --------: | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Migrations / backend / governance     |    29 |     5,388 |         9 | Migrations 0031–0042, generated backend contracts, RLS/capability evidence, migration and pgTAP/workflow checks.                                                                    |
| Ingestion / people / temporal / scale |    60 |    13,499 |       413 | Temporal normalization and evidence, Wikidata people enrichment, bounded national storage, candidate generation, exact-radius and same-register pruning, controlled-scale evidence. |
| Web / UI / generated types            |    13 |     2,943 |       234 | UK map homepage, shared explore surface, TimeRuler, coverage messaging, discovery search, legend, person panel, and generated database types.                                       |
| Workflows                             |     4 |       245 |         4 | Bounded CI, regional activation, scale-equivalence, and opt-in national governance lanes.                                                                                           |
| Documentation                         |    10 |     1,891 |       777 | Discovery, temporal, coverage, scale, architecture, blockers, roadmap, and backend-readiness records.                                                                               |
| Other                                 |     2 |        11 |         1 | Repository metadata/configuration.                                                                                                                                                  |

The stack does not contain a dedicated compact national matcher candidate index;
the backend contract records that as an explicit Batch 21B schema decision.
The migrations are a blank-database chain only: no national or regional data
load is embedded in them.

## Cross-batch audit

The following assumptions were traced through code, migrations, generated types,
tests, workflows, and docs:

| Area                          | Audit result                                                                                                                                              |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homepage/map and `/explore`   | Shared component remains active; coverage is a fraction and outside-coverage copy does not imply no history.                                              |
| TimeRuler                     | Four time modes, non-linear usable axis, BCE/CE formatting, and epoch controls remain tested.                                                             |
| People discovery              | Unified place/person search, bounded person graph paths, person-place framing, and related-person semantics remain wired to current RPCs.                 |
| Temporal evidence             | Precision-aware normalization, source wording/provenance, quarantine, and corrected effective period registry remain represented in migrations and tests. |
| Regional activation           | Regional CSV/activation and temporal/people audit lanes remain separate from the blank migration chain.                                                   |
| Conflict governance           | Classification, durable conflict entities, review lifecycle, staleness, definer refresh, and RLS grants remain present and referenced by tests.           |
| Matcher candidates            | Identifier/reference lookup remains global; candidate union preserves insertion order and the matcher remains the decision authority.                     |
| Exact-radius pruning          | Boundary, beyond-radius, equivalence, and stats assertions remain present.                                                                                |
| Same-register pruning         | Same-record multipart retention, cross-source retention, global identifiers, designation references, and veto-before-hydration assertions remain present. |
| Scale governance              | Composition, benchmark contract, growth gate, evidence digests, and opt-in national workflow remain active.                                               |
| Backend migration inventory   | 42 files, ordered names, byte sizes, and SHA-256 inventory agree.                                                                                         |
| RLS/public discovery          | Public discovery and protected contribution/admin boundaries remain explicit in the capability matrix; live catalog/RLS validation is still required.     |
| Workflows and generated types | No deleted-script reference was found; current CI database runs include generated-type parity.                                                            |

No later batch was found to leave duplicate old/new implementations active for
the audited contracts. The only follow-up findings are the non-blocking stale
PR #18 check and the two summary-doc scale statements described above.

## Test assertion audit

The `main` pgTAP suite planned 251 assertions. The tip plans 429 assertions and
the local plan checker reports every file's planned count equals its actual
assertion count. Across `main..tip`:

- no test, SQL test, or workflow file was deleted;
- no disabled or skipped test was introduced in the audited correctness gates;
- temporal expectation changes match the 0034 corrective migration and add a
  no-gap assertion;
- matcher equivalence, exact-radius, register-pruning, workload composition,
  benchmark governance, and backend contract checks were added or retained;
- current static ingestion governance suites passed 23 tests, and web
  TimeRuler/discovery suites passed 43 tests.

The national workload itself was not rerun for this audit.

## CI status

Statuses below refer to the current GitHub head of each PR, not an old run on a
superseded branch tip.

|  PR | Head       | Status                         | Evidence                                                                                                                                   |
| --: | ---------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
|  10 | `7f65e545` | `HISTORICALLY_GREEN_BUT_STALE` | All current recorded checks passed 2026-08-18; head is not the integrated tip.                                                             |
|  11 | `21746b75` | `HISTORICALLY_GREEN_BUT_STALE` | All current recorded checks passed 2026-08-19; head is not the integrated tip.                                                             |
|  12 | `6a18d008` | `HISTORICALLY_GREEN_BUT_STALE` | All current recorded checks passed 2026-08-19; head is not the integrated tip.                                                             |
|  13 | `7c0afc1e` | `HISTORICALLY_GREEN_BUT_STALE` | App, database, regional, equivalence, pipeline, and 1k/5k/25k checks passed 2026-08-19.                                                    |
|  14 | `8a25a0fb` | `HISTORICALLY_GREEN_BUT_STALE` | All recorded checks passed 2026-08-20; head is superseded by later stack heads.                                                            |
|  15 | `b50e4465` | `HISTORICALLY_GREEN_BUT_STALE` | All recorded checks passed 2026-08-20; head is superseded by later stack heads.                                                            |
|  16 | `1048d3cc` | `HISTORICALLY_GREEN_BUT_STALE` | All recorded checks passed 2026-08-20; head is superseded by later stack heads.                                                            |
|  17 | `0f38567d` | `HISTORICALLY_GREEN_BUT_STALE` | All recorded checks passed 2026-08-20; head is superseded by later stack heads.                                                            |
|  18 | `ccaad32b` | `FAILED`                       | App typecheck failed on unused `stages` in `controlled-summary.ts`; database and scale checks passed. Fixed in PR #19's descendant commit. |
|  19 | `fc3098ee` | `CURRENT_GREEN`                | App, database, contract, equivalence, pipeline, 1k/5k/25k checks passed; opt-in national pilot was correctly skipped.                      |
|  20 | `765d8044` | `CURRENT_GREEN`                | App, database, backend contract, and migration/readiness checks passed; opt-in national pilot was correctly skipped.                       |

The requested minimum current evidence is therefore green at PR #19 and PR #20;
PR #18's failed head is retained as a stale historical exception, not silently
called green.

Local dependency-free checks passed: migration syntax, migration inventory,
pgTAP plans, backend contract, and bounded governance/unit suites. The local
workflow checker could not resolve the existing `js-yaml` install, and local
package typechecks stopped before compilation because the shell's pnpm is 11.19.0
while the repository declares 9.12.0 and the existing install lacks
`@types/node`. No dependency or lockfile workaround was performed. GitHub CI at
PR #20 supplies the current compiler/workflow evidence.

## Promotion recommendation

`RECOMMENDED_PROMOTION_STRATEGY = B`

Create one owner-authorized integration PR from a new branch based exactly on
the approved final tip (`765d8044...`) into `main`, and merge that integration
PR without squashing the 64 batch commits. Keep PRs #10–#20 and their bases
unchanged until the integration decision is complete.

This is safer than sequentially merging the existing stacked PRs because their
bases are the preceding development branches, not `main`; sequential promotion
would require branch/base management and can create duplicated or confusing
merge history. A single final-tip PR gives GitHub one complete diff and one
mainline CI gate, while preserving every batch commit for review, bisecting, and
reversion. Prefer a normal merge commit or fast-forward according to the
repository's merge policy; do not squash if preserving batch history is the
goal.

The exact owner sequence and stop conditions are in
[`docs/STACK_PROMOTION.md`](STACK_PROMOTION.md).

## Pre-backend seal conditions

Before linking the first persistent Whilom Supabase project, all of the
following must be true:

1. Owner approves the exact source SHA and the promotion PR's final main SHA.
2. The integrated mainline checkpoint is recorded and is not a moving branch
   name alone.
3. The ordered 42-migration chain is present on that main SHA and its inventory
   matches the SQL files and digests.
4. Current CI on the resulting main is green: app, database/pgTAP, workflow,
   migration, backend-contract, ingestion, and web checks as applicable.
5. The pgTAP plans and the ephemeral database replay are green, including
   generated-type parity and public/protected RLS checks.
6. Ingestion TypeScript and relevant ingestion governance/equivalence tests are
   green; no national-scale workload is required merely to seal this stack.
7. Web TypeScript/tests are green where applicable.
8. No unresolved `BLOCKING` stack defect remains.
9. The owner confirms the hosted project is newly created and empty, with the
   project ref and region recorded; this audit itself did not make that check.

Until those conditions are satisfied, the checkpoint is `READY_TO_SEAL`, not
`SEALED`.
