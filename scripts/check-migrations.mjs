/**
 * Catch malformed ALTER TABLE action lists before CI does.
 *
 * There is no local Postgres in this environment — every database result comes
 * from an ephemeral stack in CI — so a SQL syntax error costs a push, a runner,
 * a container start and about four minutes to discover. This batch spent that
 * twice on the same mistake:
 *
 *     alter table t
 *       add column a text,
 *       constraint c check (...);   -- needs ADD CONSTRAINT
 *
 * Postgres reports "syntax error at or near constraint" from inside a
 * `supabase start` log, which is a long way from the line that caused it.
 *
 * Deliberately narrow. This is not a SQL parser and does not pretend to be one;
 * it checks the one construct that has actually gone wrong here, and says
 * nothing about anything else.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = 'supabase/migrations';

/** Every verb that may begin an action in an ALTER TABLE action list. */
const ACTION_VERBS = [
  'add', 'drop', 'alter', 'rename', 'set', 'reset', 'enable', 'disable',
  'validate', 'cluster', 'inherit', 'no', 'of', 'not', 'attach', 'detach',
  'owner', 'replica', 'force', 'options',
];

/**
 * Strip comments and string literals so their commas and keywords cannot be
 * mistaken for syntax. Replaced with spaces rather than removed so that
 * reported offsets still line up with the original text.
 */
function blank(sql) {
  let out = '';
  let i = 0;
  while (i < sql.length) {
    const two = sql.slice(i, i + 2);
    if (two === '--') {
      const end = sql.indexOf('\n', i);
      const stop = end === -1 ? sql.length : end;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (two === '/*') {
      const end = sql.indexOf('*/', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += ' '.repeat(stop - i);
      i = stop;
    } else if (sql[i] === "'" || sql[i] === '"') {
      const quote = sql[i];
      let j = i + 1;
      while (j < sql.length && sql[j] !== quote) j += 1;
      out += ' '.repeat(Math.min(j + 1, sql.length) - i);
      i = j + 1;
    } else if (two === '$$') {
      const end = sql.indexOf('$$', i + 2);
      const stop = end === -1 ? sql.length : end + 2;
      out += ' '.repeat(stop - i);
      i = stop;
    } else {
      out += sql[i];
      i += 1;
    }
  }
  return out;
}

/** Split an action list on top-level commas only. */
function topLevelSplit(text) {
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of text) {
    if (char === '(') depth += 1;
    if (char === ')') depth -= 1;
    if (char === ',' && depth === 0) {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);
  return parts;
}

let failed = 0;

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
  const original = readFileSync(join(DIR, file), 'utf8');
  const sql = blank(original);

  const pattern = /\balter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?[\w."]+([\s\S]*?);/gi;
  for (const match of sql.matchAll(pattern)) {
    const body = match[1] ?? '';
    // Only an action list can be misformed this way. ALTER TABLE ... RENAME TO
    // and similar single-clause forms have no list to get wrong.
    for (const action of topLevelSplit(body)) {
      const trimmed = action.trim();
      if (trimmed === '') continue;
      const verb = trimmed.split(/\s+/)[0].toLowerCase();
      if (ACTION_VERBS.includes(verb)) continue;
      const line = original.slice(0, match.index + body.indexOf(action)).split('\n').length;
      console.error(
        `FAIL ${file}:${line}: ALTER TABLE action starts with "${verb}", which is not an action verb.` +
          (verb === 'constraint' ? ' Did you mean ADD CONSTRAINT?' : ''),
      );
      failed += 1;
    }
  }
}

/**
 * Column names that are also Postgres keywords.
 *
 * `temporal_associations.precision` is a legal column name and an illegal bare
 * identifier in several grammar positions — inside a CHECK constraint it is a
 * syntax error, while `ta.precision` and `precision::text` parse fine. The
 * schema is not going to rename the column, so the rule is: qualify it or
 * quote it.
 */
const KEYWORD_COLUMNS = ['precision'];

for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
  const original = readFileSync(join(DIR, file), 'utf8');
  const sql = blank(original);

  for (const check of sql.matchAll(/\bcheck\s*\(/gi)) {
    // Take the balanced body of the check constraint.
    let depth = 0;
    let end = check.index + check[0].length - 1;
    for (; end < sql.length; end += 1) {
      if (sql[end] === '(') depth += 1;
      if (sql[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = sql.slice(check.index, end);
    for (const word of KEYWORD_COLUMNS) {
      // Bare: not preceded by a dot (qualified) or a quote (quoted).
      const bare = new RegExp(`(^|[^.\\w"])${word}\\s*(?:not\\s+)?(?:in\\b|=|<|>|!)`, 'i');
      if (!bare.test(body)) continue;
      const line = original.slice(0, check.index).split('\n').length;
      console.error(
        `FAIL ${file}:${line}: bare "${word}" inside a CHECK constraint is a syntax error. Quote it as "${word}".`,
      );
      failed += 1;
    }
  }
}

/**
 * A RETURNS TABLE column is an OUT parameter, and Postgres will not accept a
 * keyword as one — even though the same word is a perfectly legal column name
 * on a table. `precision text` in a returns-table list is a syntax error, and
 * it reports at the word rather than at the declaration that caused it.
 */
for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql'))) {
  const original = readFileSync(join(DIR, file), 'utf8');
  const sql = blank(original);

  for (const returns of sql.matchAll(/\breturns\s+table\s*\(/gi)) {
    let depth = 0;
    let end = returns.index + returns[0].length - 1;
    for (; end < sql.length; end += 1) {
      if (sql[end] === '(') depth += 1;
      if (sql[end] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    const body = sql.slice(returns.index + returns[0].length, end);
    for (const column of topLevelSplit(body)) {
      const name = column.trim().split(/\s+/)[0]?.toLowerCase();
      if (!name || !KEYWORD_COLUMNS.includes(name)) continue;
      const line = original.slice(0, returns.index).split('\n').length;
      console.error(
        `FAIL ${file}:${line}: RETURNS TABLE column named "${name}" is a keyword and cannot be an OUT parameter. Rename it.`,
      );
      failed += 1;
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} migration problem(s).`);
  process.exit(1);
}
console.log(`ok   ${readdirSync(DIR).filter((f) => f.endsWith('.sql')).length} migrations`);
