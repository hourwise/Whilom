/** Validate the committed, immutable facts used by the stack promotion runbook. */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const evidence = JSON.parse(readFileSync('docs/stack-seal-evidence.json', 'utf8'));
const expected = {
  mainSha: '159a154f7c9eec79f0327a022981a9bea512bf81',
  sourceBranch: 'codex/whilom-backend-readiness',
  sourceSha: '765d8044c9935f56aaa966c2552b4ffd55cdbae6',
  auditBranch: 'codex/whilom-stack-seal-audit',
  migrationCount: 42,
  totalStackCommits: 64,
  totalStackFilesChanged: 118,
  totalStackAdditions: 23977,
  totalStackDeletions: 1438,
  stackTopology: 'CLEAN_LINEAR',
  migrationChain: 'CONTINUOUS',
  testGovernance: 'INTACT',
  backendSourceCheckpoint: 'READY_TO_SEAL',
  promotionStrategy: 'DEDICATED_INTEGRATION_PR_FROM_FINAL_TIP',
};

let failed = 0;
const check = (condition, message) => {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failed += 1;
  }
};

for (const [key, value] of Object.entries(expected)) {
  check(evidence[key] === value, `${key} must be ${JSON.stringify(value)}`);
}

check(
  JSON.stringify(evidence.expectedOpenPrs) ===
    JSON.stringify([10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20]),
  'expected PR set',
);
check(evidence.sealed === false, 'audit must not claim SEALED');
check(evidence.hostedSupabaseAccessed === false, 'hosted Supabase access must remain false');
check(evidence.migrationsDeployed === false, 'migration deployment must remain false');
check(evidence.dataPublished === false, 'publication must remain false');

const revParse = (ref) => execFileSync('git', ['rev-parse', ref], { encoding: 'utf8' }).trim();
check(
  revParse(evidence.sourceBranch) === evidence.sourceSha,
  'local source branch must remain at the audited source SHA',
);
check(revParse('main') === evidence.mainSha, 'local main must remain at the audited main SHA');

if (failed) process.exitCode = 1;
else console.log('ok   stack promotion evidence');
