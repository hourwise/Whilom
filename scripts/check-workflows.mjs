/**
 * Validate every GitHub Actions workflow parses.
 *
 * A malformed workflow does not fail loudly: GitHub reports a run with zero
 * jobs and a red cross, and `gh run view --log-failed` returns "log not found"
 * because there was never a job to log. That is an unpleasant thing to debug
 * from the outside, and a second of YAML parsing here avoids it entirely.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

const dir = '.github/workflows';
let failed = 0;

for (const file of readdirSync(dir).filter((f) => /\.ya?ml$/.test(f))) {
  const path = join(dir, file);
  try {
    const doc = yaml.load(readFileSync(path, 'utf8'));
    const jobs = Object.keys(doc?.jobs ?? {});
    if (jobs.length === 0) throw new Error('no jobs defined');
    console.log(`ok   ${file} (${jobs.join(', ')})`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL ${file}: ${error instanceof Error ? error.message.split('\n')[0] : String(error)}`);
  }
}

if (failed > 0) process.exit(1);
