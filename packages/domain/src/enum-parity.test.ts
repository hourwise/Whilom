import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  AccessCost,
  AppRole,
  BadgeCategory,
  ContributionType,
  DesignationGrade,
  DesignationType,
  EntityType,
  EventType,
  FacilityType,
  HistoricalPeriod,
  LocationMethod,
  ModerationState,
  ObjectType,
  PlaceType,
  ReportReason,
  RouteDifficulty,
  RouteType,
  SourceKind,
  TransportMode,
  TrustLevel,
  WishlistKind,
} from './enums';

/**
 * SQL ↔ domain enum parity.
 *
 * `packages/domain/src/enums.ts` claims to mirror the Postgres enum types, but
 * nothing enforced it — the two could drift silently until a runtime insert
 * failed with "invalid input value for enum". This reads the actual migrations
 * and compares.
 *
 * It is the TypeScript half of the contract chain:
 *   Postgres → generated types → @whilom/domain → @whilom/validation → ingestion
 * The Postgres → generated-types half is enforced by the drift check in the
 * database CI job.
 */

const MIGRATIONS_DIR = fileURLToPath(new URL('../../../supabase/migrations', import.meta.url));

/**
 * Read every enum type out of the migration chain, applying `create type` and
 * any later `alter type ... add value` in filename order — the same order
 * Postgres applies them in.
 */
function readSqlEnums(): Map<string, string[]> {
  const enums = new Map<string, string[]>();
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    // Strip `--` line comments first: a comment such as "the feature's extent"
    // contains an apostrophe, which would otherwise be read as an enum value.
    // Safe here because no enum value contains a double hyphen.
    const sql = readFileSync(join(MIGRATIONS_DIR, file), 'utf8').replace(/--[^\n]*/g, '');

    const createRe = /create\s+type\s+public\.(\w+)\s+as\s+enum\s*\(([\s\S]*?)\)\s*;/gi;
    for (const match of sql.matchAll(createRe)) {
      const [, name, body] = match;
      if (!name || body === undefined) continue;
      enums.set(name, [...body.matchAll(/'((?:[^']|'')*)'/g)].map((m) => (m[1] ?? '').replace(/''/g, "'")));
    }

    const alterRe = /alter\s+type\s+public\.(\w+)\s+add\s+value\s+(?:if\s+not\s+exists\s+)?'((?:[^']|'')*)'/gi;
    for (const match of sql.matchAll(alterRe)) {
      const [, name, value] = match;
      if (!name || value === undefined) continue;
      const existing = enums.get(name);
      const clean = value.replace(/''/g, "'");
      if (existing && !existing.includes(clean)) existing.push(clean);
    }
  }

  return enums;
}

const SQL_ENUMS = readSqlEnums();

/** Domain object → the Postgres type it mirrors. */
const PAIRS: ReadonlyArray<[string, Record<string, string>]> = [
  ['app_role', AppRole],
  ['entity_type', EntityType],
  ['place_type', PlaceType],
  ['historical_period', HistoricalPeriod],
  ['event_type', EventType],
  ['object_type', ObjectType],
  ['route_type', RouteType],
  ['route_difficulty', RouteDifficulty],
  ['transport_mode', TransportMode],
  ['access_cost', AccessCost],
  ['trust_level', TrustLevel],
  ['moderation_state', ModerationState],
  ['source_kind', SourceKind],
  ['designation_type', DesignationType],
  ['designation_grade', DesignationGrade],
  ['facility_type', FacilityType],
  ['badge_category', BadgeCategory],
  ['contribution_type', ContributionType],
  ['report_reason', ReportReason],
  ['wishlist_kind', WishlistKind],
  ['location_method', LocationMethod],
];

describe('SQL / domain enum parity', () => {
  it('finds the migration chain', () => {
    expect(SQL_ENUMS.size).toBeGreaterThan(15);
  });

  it.each(PAIRS)('public.%s matches its domain enum', (sqlName, domainEnum) => {
    const sqlValues = SQL_ENUMS.get(sqlName);
    expect(sqlValues, `public.${sqlName} not found in supabase/migrations`).toBeDefined();

    const inSqlOnly = sqlValues!.filter((v) => !Object.values(domainEnum).includes(v));
    const inDomainOnly = Object.values(domainEnum).filter((v) => !sqlValues!.includes(v));

    expect(inSqlOnly, `present in Postgres but missing from @whilom/domain`).toEqual([]);
    expect(inDomainOnly, `present in @whilom/domain but missing from Postgres`).toEqual([]);
  });

  it('covers the generic structure classifications added in 0019', () => {
    // These are the ones the Yorkshire POC proved were missing; a regression
    // here would silently make ordinary listed heritage untypeable again.
    expect(SQL_ENUMS.get('place_type')).toContain('building');
    expect(SQL_ENUMS.get('place_type')).toContain('structure');
  });

  it('has a Postgres type for every location method', () => {
    expect(SQL_ENUMS.get('location_method')).toContain('geometry_centroid');
    expect(SQL_ENUMS.get('location_method')).toContain('source_coordinate');
  });
});
