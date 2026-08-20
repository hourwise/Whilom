/** Keep the machine-readable migration audit synchronized with SQL files. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const directory = 'supabase/migrations';
const inventoryPath = 'supabase/bootstrap/migration-inventory.json';
const inventory = JSON.parse(readFileSync(inventoryPath, 'utf8'));
const files = readdirSync(directory)
  .filter((file) => file.endsWith('.sql'))
  .sort();
const entries = inventory.migrationOrder ?? [];
let failed = 0;

if (inventory.migrationCount !== files.length) {
  console.error(`FAIL inventory count ${inventory.migrationCount} != ${files.length}`);
  failed += 1;
}
if (
  entries.length !== files.length ||
  entries.some((entry, index) => entry.file !== files[index])
) {
  console.error('FAIL migration order/file set is out of sync');
  failed += 1;
}

for (const [index, file] of files.entries()) {
  const entry = entries[index];
  const bytes = readFileSync(join(directory, file));
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if (!entry || entry.bytes !== bytes.length || entry.sha256 !== sha256) {
    console.error(`FAIL ${file}: inventory bytes/digest do not match the file`);
    failed += 1;
  }
}

if (failed) {
  process.exitCode = 1;
} else {
  console.log(`ok   migration inventory (${files.length} files, ordered and hashed)`);
}
