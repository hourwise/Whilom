import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditWorkersArtifact } from './audit-workers-artifact.mjs';
import { createBuildEnvironment, loadEnvironment, writeSanitizedEnv } from './build-workers-safe.mjs';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const artifactDir = path.join(repoRoot, 'apps', 'web', '.open-next');
const wranglerConfigPath = path.join(repoRoot, 'apps', 'web', 'wrangler.jsonc');
const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whilom-workers-boundary-test-'));
const fixtureEnvPath = path.join(fixtureRoot, '.env.fixture');
const syntheticSecret = 'w3-synthetic-service-role-secret-20260906';
const fixturePublic = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.example.supabase.co',
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'fixture-public-anon-key',
  NEXT_PUBLIC_MAP_STYLE_URL: 'https://fixture.example/map-style.json',
};
const rootEnvPath = path.join(repoRoot, '.env');

function digest(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');
}

const rootEnvBefore = digest(rootEnvPath);
try {
  fs.writeFileSync(
    fixtureEnvPath,
    [
      ...Object.entries(fixturePublic).map(([key, value]) => `${key}=${value}`),
      `SUPABASE_SERVICE_ROLE_KEY=${syntheticSecret}`,
      'SUPABASE_DB_URL=postgres://synthetic.invalid/never-connect',
      'EXPO_PUBLIC_SUPABASE_URL=https://synthetic-mobile.invalid',
      'UNRELATED_API_KEY=w3-synthetic-unrelated-api-key',
    ].join('\n') + '\n',
    'utf8',
  );

  const baseEnvironment = { ...process.env };
  for (const key of Object.keys(fixturePublic)) delete baseEnvironment[key];

  const { allowedValues, forbiddenValues } = loadEnvironment({
    envFilePath: fixtureEnvPath,
    baseEnvironment,
  });
  assert.deepEqual(allowedValues, fixturePublic);
  assert.ok(forbiddenValues.includes(syntheticSecret));

  const sanitizedProcessEnvironment = createBuildEnvironment(
    allowedValues,
    {
      ...baseEnvironment,
      SUPABASE_SERVICE_ROLE_KEY: syntheticSecret,
      UNRELATED_API_KEY: 'w3-synthetic-unrelated-api-key',
    },
    fixtureRoot,
  );
  assert.equal(sanitizedProcessEnvironment.SUPABASE_SERVICE_ROLE_KEY, undefined);
  assert.equal(sanitizedProcessEnvironment.UNRELATED_API_KEY, undefined);
  assert.deepEqual(
    Object.fromEntries(Object.entries(sanitizedProcessEnvironment).filter(([key]) => key.startsWith('NEXT_PUBLIC_'))),
    fixturePublic,
  );

  const sanitizedEnvPath = path.join(fixtureRoot, 'sanitized.env');
  writeSanitizedEnv(sanitizedEnvPath, allowedValues);
  const sanitizedText = fs.readFileSync(sanitizedEnvPath, 'utf8');
  assert.ok(sanitizedText.includes('NEXT_PUBLIC_SUPABASE_URL'));
  assert.ok(sanitizedText.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'));
  assert.ok(!sanitizedText.includes(syntheticSecret));

  // The already-generated W3-R1 reference artifact is checked with the same
  // guard used by the sanctioned build path. A future safe build replaces it
  // only after this exact audit succeeds.
  const cleanResult = auditWorkersArtifact({
    artifactDir,
    wranglerConfigPath,
    forbiddenValues: [syntheticSecret, 'postgres://synthetic.invalid/never-connect'],
  });
  assert.ok(cleanResult.filesScanned > 0);

  const cleanFixtureArtifact = path.join(fixtureRoot, 'clean-artifact');
  fs.mkdirSync(path.join(cleanFixtureArtifact, 'cloudflare'), { recursive: true });
  const cleanEnv = JSON.stringify(fixturePublic);
  fs.writeFileSync(
    path.join(cleanFixtureArtifact, 'cloudflare', 'next-env.mjs'),
    `export const production = ${cleanEnv};\nexport const development = ${cleanEnv};\nexport const test = ${cleanEnv};\n`,
    'utf8',
  );
  const fixtureAudit = auditWorkersArtifact({
    artifactDir: cleanFixtureArtifact,
    requiredEnv: fixturePublic,
    forbiddenValues: [syntheticSecret],
  });
  assert.equal(fixtureAudit.environmentFiles, 0);

  const contaminatedArtifact = path.join(fixtureRoot, 'contaminated-artifact');
  fs.mkdirSync(path.join(contaminatedArtifact, 'cloudflare'), { recursive: true });
  const contaminatedEnv = JSON.stringify({
    ...fixturePublic,
    SUPABASE_SERVICE_ROLE_KEY: syntheticSecret,
  });
  fs.writeFileSync(
    path.join(contaminatedArtifact, 'cloudflare', 'next-env.mjs'),
    `export const production = ${contaminatedEnv};\nexport const development = ${contaminatedEnv};\nexport const test = ${contaminatedEnv};\n`,
    'utf8',
  );
  assert.throws(
    () => auditWorkersArtifact({
      artifactDir: contaminatedArtifact,
      requiredEnv: fixturePublic,
      forbiddenValues: [syntheticSecret],
    }),
    /Workers artifact audit failed/,
  );

  console.log('Workers environment boundary regression passed: synthetic forbidden material was excluded and contaminated output was rejected.');
} finally {
  assert.equal(digest(rootEnvPath), rootEnvBefore, 'the developer .env must remain byte-identical');
  fs.rmSync(fixtureRoot, { recursive: true, force: true });
}
