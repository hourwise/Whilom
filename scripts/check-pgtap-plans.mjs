/**
 * Check every pgTAP file plans the number of assertions it actually contains.
 *
 * A miscounted plan does not fail like a wrong assertion. pgTAP reports
 * "planned 26 tests but ran 28" and marks the surplus as *failures*, so a
 * perfectly correct test file goes red for a reason that has nothing to do with
 * the code under test. Diagnosing that from a CI log costs several minutes and
 * a database spin-up; counting the lines here costs milliseconds.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/tests';

/**
 * The pgTAP assertions this project uses. Deliberately an explicit list rather
 * than a loose pattern: a regex matching any `select something(` would count
 * ordinary setup queries and be wrong in the more damaging direction.
 */
const ASSERTIONS = [
  'ok', 'is', 'isnt', 'matches', 'imatches', 'alike', 'ialike',
  'throws_ok', 'lives_ok', 'is_empty', 'isa_ok', 'cmp_ok',
  'has_table', 'has_column', 'has_index', 'has_function', 'has_type',
  'col_is_pk', 'col_not_null', 'results_eq', 'set_eq', 'bag_eq',
];

const pattern = new RegExp(`^\\s*select\\s+(${ASSERTIONS.join('|')})\\s*\\(`, 'gim');

let failed = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
  const sql = readFileSync(join(DIR, file), 'utf8');
  const planned = /select\s+plan\((\d+)\)/i.exec(sql);
  if (!planned) {
    console.error(`FAIL ${file}: no plan() call`);
    failed += 1;
    continue;
  }
  const actual = (sql.match(pattern) ?? []).length;
  const expected = Number(planned[1]);
  if (actual !== expected) {
    console.error(`FAIL ${file}: plans ${expected} but contains ${actual} assertions`);
    failed += 1;
  } else {
    console.log(`ok   ${file} (${actual} assertions)`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} pgTAP file(s) have a plan that does not match their assertions.`);
  process.exit(1);
}
