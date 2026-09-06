import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ALLOWED_WORKER_ENV_KEYS = new Set([
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_MAP_STYLE_URL',
]);

const PROHIBITED_ENV_KEYS = new Set([
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_DB_URL',
  'SUPABASE_ACCESS_TOKEN',
  'DATABASE_URL',
  'PGPASSWORD',
  'POSTGRES_PASSWORD',
  'CLOUDFLARE_API_TOKEN',
  'CLOUDFLARE_API_KEY',
  'AWS_ACCESS_KEY_ID',
  'AWS_SECRET_ACCESS_KEY',
  'PRIVATE_KEY',
]);

const PROHIBITED_WRANGLER_BINDINGS = new Set([
  'd1_databases',
  'durable_objects',
  'hyperdrive',
  'kv_namespaces',
  'queues',
  'r2_buckets',
  'secrets_store_secrets',
  'vectorize',
]);

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsNamedKey(text, key) {
  const pattern = new RegExp(
    `(^|[^A-Za-z0-9_])${escapeRegExp(key)}([^A-Za-z0-9_]|$)`,
    'i',
  );
  return pattern.test(text);
}

function parseJsonc(filePath) {
  const source = fs.readFileSync(filePath, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
    .replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(source);
}

function walkFiles(root) {
  const files = [];
  const visit = (current) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) visit(absolute);
      else files.push(absolute);
    }
  };
  visit(root);
  return files;
}

function parseNextEnvExports(filePath) {
  const source = fs.readFileSync(filePath, 'utf8');
  const modes = {};
  for (const mode of ['production', 'development', 'test']) {
    const expression = new RegExp(
      `export\\s+const\\s+${mode}\\s*=\\s*(\\{[\\s\\S]*?\\});`,
    );
    const match = source.match(expression);
    if (!match) {
      throw new Error(`unable to parse ${mode} environment export`);
    }
    modes[mode] = JSON.parse(match[1]);
  }
  return modes;
}

function addFinding(findings, message) {
  if (!findings.includes(message)) findings.push(message);
}

/**
 * Audit an OpenNext artifact without emitting any environment values.
 *
 * `requiredEnv` and `forbiddenValues` are intentionally supplied by the
 * caller in memory. They are never included in failure messages.
 */
export function auditWorkersArtifact({
  artifactDir,
  wranglerConfigPath,
  requiredEnv = {},
  forbiddenValues = [],
}) {
  const findings = [];
  if (!fs.existsSync(artifactDir) || !fs.statSync(artifactDir).isDirectory()) {
    throw new Error(`Workers artifact audit failed: missing artifact directory ${artifactDir}`);
  }

  const files = walkFiles(artifactDir);
  const envFiles = files.filter((filePath) => {
    const name = path.basename(filePath).toLowerCase();
    return name === '.env' || name.startsWith('.env.') || name.startsWith('.dev.vars');
  });
  for (const filePath of envFiles) {
    addFinding(findings, `environment file was packaged: ${path.relative(artifactDir, filePath)}`);
  }

  const envModules = files.filter((filePath) => path.basename(filePath) === 'next-env.mjs');
  if (envModules.length === 0) {
    addFinding(findings, 'OpenNext cloudflare/next-env.mjs was not generated');
  }

  const parsedModes = [];
  for (const filePath of envModules) {
    let modes;
    try {
      modes = parseNextEnvExports(filePath);
    } catch (error) {
      addFinding(findings, `unable to parse ${path.relative(artifactDir, filePath)}: ${error.message}`);
      continue;
    }
    parsedModes.push({ filePath, modes });
    for (const [mode, values] of Object.entries(modes)) {
      for (const key of Object.keys(values)) {
        if (!ALLOWED_WORKER_ENV_KEYS.has(key)) {
          addFinding(findings, `unexpected environment key in ${mode}: ${key}`);
        }
        if (PROHIBITED_ENV_KEYS.has(key)) {
          addFinding(findings, `prohibited environment key in ${mode}: ${key}`);
        }
      }
    }
  }

  for (const filePath of files) {
    const source = fs.readFileSync(filePath);
    const text = source.toString('utf8');
    for (const key of PROHIBITED_ENV_KEYS) {
      if (containsNamedKey(text, key)) {
        addFinding(findings, `prohibited environment key text found in ${path.relative(artifactDir, filePath)}: ${key}`);
      }
    }
    for (const value of forbiddenValues) {
      if (typeof value === 'string' && value.length >= 8 && source.includes(Buffer.from(value))) {
        addFinding(findings, `prohibited environment material found in ${path.relative(artifactDir, filePath)}`);
      }
    }
  }

  const production = parsedModes[0]?.modes.production;
  for (const [key, expectedValue] of Object.entries(requiredEnv)) {
    const expectedBytes = Buffer.from(expectedValue);
    const presentInArtifact = files.some((filePath) => fs.readFileSync(filePath).includes(expectedBytes));
    if (!presentInArtifact) {
      addFinding(findings, `required public environment value missing or changed: ${key}`);
    }
  }

  if (wranglerConfigPath && fs.existsSync(wranglerConfigPath)) {
    try {
      const config = parseJsonc(wranglerConfigPath);
      for (const [key, value] of Object.entries(config.vars ?? {})) {
        if (!ALLOWED_WORKER_ENV_KEYS.has(key)) {
          addFinding(findings, `unexpected Wrangler variable: ${key}`);
        }
        if (PROHIBITED_ENV_KEYS.has(key)) {
          addFinding(findings, `prohibited Wrangler variable: ${key}`);
        }
        if (typeof value !== 'string') {
          addFinding(findings, `Wrangler variable is not a string: ${key}`);
        }
      }
      for (const [environmentName, environment] of Object.entries(config.env ?? {})) {
        for (const key of Object.keys(environment?.vars ?? {})) {
          if (!ALLOWED_WORKER_ENV_KEYS.has(key)) {
            addFinding(findings, `unexpected Wrangler variable in env.${environmentName}: ${key}`);
          }
        }
      }
      for (const binding of PROHIBITED_WRANGLER_BINDINGS) {
        if (config[binding]) addFinding(findings, `unexpected Cloudflare binding: ${binding}`);
      }
    } catch (error) {
      addFinding(findings, `unable to parse Wrangler configuration: ${error.message}`);
    }
  }

  if (findings.length > 0) {
    throw new Error(`Workers artifact audit failed:\n- ${findings.join('\n- ')}`);
  }

  return {
    filesScanned: files.length,
    environmentModules: envModules.length,
    environmentFiles: envFiles.length,
    allowedEnvironmentKeys: Object.keys(production ?? {}).sort(),
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const artifactDir = path.resolve(process.argv[2] ?? 'apps/web/.open-next');
  const wranglerConfigPath = path.resolve(process.argv[3] ?? 'apps/web/wrangler.jsonc');
  try {
    const result = auditWorkersArtifact({ artifactDir, wranglerConfigPath });
    console.log(`Workers artifact audit passed (${result.filesScanned} files scanned).`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
