/** Static/unit checks for the Batch 21A backend preparation artifacts. */
import { readFileSync } from 'node:fs';
import {
  workUnitKey,
  workUnitsForHalo,
  WORK_UNIT_SCHEME,
} from '../supabase/bootstrap/work-unit.mjs';

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));
const query = readJson('supabase/bootstrap/postgis-query-contract.json');
const benchmark = readJson('supabase/bootstrap/query-benchmark-contract.json');
const capabilities = readJson('supabase/bootstrap/backend-capability-matrix.json');
const inventory = readJson('supabase/bootstrap/migration-inventory.json');
let failed = 0;
const check = (condition, message) => {
  if (!condition) {
    console.error(`FAIL ${message}`);
    failed += 1;
  }
};

check(inventory.migrationCount === 42, 'migration inventory must describe 42 migrations');
check(query.radiusMetres === 5_000, 'candidate contract radius must remain 5,000m');
check(
  query.spatial.authoritativePredicate.includes('ST_DWithin'),
  'spatial contract must name ST_DWithin',
);
check(query.identifierLookup.geographicRestriction === 'none', 'identifier lookup must be global');
check(
  query.designationReferenceLookup.geographicRestriction === 'none',
  'designation-reference lookup must be global',
);
check(
  query.governance.sameRegisterRule === 'preserve-and-apply-before-hydration',
  'same-register governance must be retained',
);
check(
  query.union.orderBy === 'canonical insertion sequence ascending',
  'canonical insertion ordering must be explicit',
);
check(
  benchmark.scenarios.length >= 8,
  'benchmark contract must include representative and boundary scenarios',
);
check(
  benchmark.growthGate.perRecordGrowthVsSizeMax === 1,
  'existing growth threshold must remain 1.0',
);
check(
  capabilities.capabilities.some(
    (item) => item.capability === 'compact production matcher candidate index' && item.notPresent,
  ),
  'schema gap must remain explicit',
);
check(
  capabilities.rlsAudit.liveChecksRequired.length >= 4,
  'RLS live validation list must be explicit',
);
check(WORK_UNIT_SCHEME === 'OSGB10_EPSG27700_V1', 'work-unit scheme must be versioned');
check(workUnitKey(450000, 450000) === 'E45N45', 'work-unit key calculation');
check(
  workUnitsForHalo(450000, 450000).length === 4,
  '5km halo must enumerate the complete 2x2 envelope at a cell corner',
);
check(workUnitsForHalo(450000, 450000).includes('E44N44'), 'halo must include corner neighbours');
check(
  workUnitsForHalo(449999, 449999).includes('E44N44'),
  'boundary halo must derive cells from the expanded envelope',
);

if (failed) process.exitCode = 1;
else console.log('ok   backend contract checks');
