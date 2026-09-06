import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { ALLOWED_WORKER_ENV_KEYS, auditWorkersArtifact } from './audit-workers-artifact.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.dirname(scriptDir);
const appSource = path.join(repoRoot, 'apps', 'web');
const actualArtifactDir = path.join(appSource, '.open-next');
const allowedKeys = [...ALLOWED_WORKER_ENV_KEYS];
const prohibitedKeyPattern = /^(?:SUPABASE_|EXPO_PUBLIC_|DATABASE|DB_|PG|POSTGRES|CLOUDFLARE_|AWS_|GOOGLE_|STRIPE_)/i;
const sensitiveNamePattern = /(?:SECRET|PASSWORD|TOKEN|PRIVATE_KEY|SERVICE_ROLE|CREDENTIALS|API[_-]?KEY|AUTH(?:ORIZATION)?|ACCESS[_-]?KEY|SIGNING|ENCRYPTION)/i;
const SAFE_HOST_ENV_KEYS = new Set([
  'APPDATA',
  'CI',
  'COMSPEC',
  'COREPACK_HOME',
  'HOME',
  'HOMEDRIVE',
  'HOMEPATH',
  'LOCALAPPDATA',
  'NODE_ENV',
  'NODE_OPTIONS',
  'OS',
  'PATHEXT',
  'Path',
  'PATH',
  'PROGRAMDATA',
  'ProgramData',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'SystemDrive',
  'SystemRoot',
  'TEMP',
  'TMP',
  'TMPDIR',
  'USERPROFILE',
  'WINDIR',
]);
const requireFromScript = createRequire(import.meta.url);

export function parseDotEnv(text) {
  const values = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const assignment = line.match(/^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!assignment) continue;
    let value = assignment[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        value = value.slice(1, -1);
      }
    } else if (value.startsWith("'") && value.endsWith("'")) {
      value = value.slice(1, -1).replaceAll("\\'", "'");
    } else {
      value = value.replace(/\s+#.*$/, '').trim();
    }
    values[assignment[1]] = value;
  }
  return values;
}

function readEnvFile(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return {};
  return parseDotEnv(fs.readFileSync(filePath, 'utf8'));
}

function isSensitiveName(name) {
  if (ALLOWED_WORKER_ENV_KEYS.has(name)) return false;
  return prohibitedKeyPattern.test(name) || sensitiveNamePattern.test(name);
}

export function loadEnvironment({ envFilePath, baseEnvironment = process.env }) {
  const fileValues = readEnvFile(envFilePath);
  const allowedValues = {};
  for (const key of allowedKeys) {
    const value = baseEnvironment[key] ?? fileValues[key];
    if (value !== undefined && value !== '') allowedValues[key] = value;
  }
  for (const key of ['NEXT_PUBLIC_SUPABASE_URL', 'NEXT_PUBLIC_SUPABASE_ANON_KEY']) {
    if (!allowedValues[key]) {
      throw new Error(`Workers build requires ${key} from the process environment or the sanctioned env file.`);
    }
  }

  const forbiddenValues = [
    ...Object.entries(fileValues)
      .filter(([key]) => !ALLOWED_WORKER_ENV_KEYS.has(key))
      .map(([, value]) => value),
    ...Object.entries(baseEnvironment)
      .filter(([key]) => isSensitiveName(key))
      .map(([, value]) => value),
  ];
  return { allowedValues, forbiddenValues };
}

export function writeSanitizedEnv(filePath, values) {
  const content = Object.entries(values)
    .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
    .join('\n') + '\n';
  fs.writeFileSync(filePath, content, 'utf8');
}

function createPnpmShim(sandboxRoot) {
  const shimDir = path.join(sandboxRoot, '.whilom-toolchain');
  fs.mkdirSync(shimDir, { recursive: true });
  if (process.platform === 'win32') {
    const corepack = path.join(path.dirname(process.execPath), 'corepack.cmd');
    const command = fs.existsSync(corepack) ? corepack : 'corepack';
    fs.writeFileSync(
      path.join(shimDir, 'pnpm.cmd'),
      `@echo off\r\ncall "${command}" pnpm %*\r\nexit /b %ERRORLEVEL%\r\n`,
      'utf8',
    );
    const npmCli = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(npmCli)) {
      fs.writeFileSync(
        path.join(shimDir, 'npm.cmd'),
        `@echo off\r\n"${process.execPath}" "${npmCli}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
        'utf8',
      );
    }
  } else {
    const shimPath = path.join(shimDir, 'pnpm');
    fs.writeFileSync(shimPath, '#!/usr/bin/env sh\nexec corepack pnpm "$@"\n', 'utf8');
    fs.chmodSync(shimPath, 0o755);
    const npmCli = path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
    if (fs.existsSync(npmCli)) {
      const npmShimPath = path.join(shimDir, 'npm');
      fs.writeFileSync(npmShimPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${npmCli}" "$@"\n`, 'utf8');
      fs.chmodSync(npmShimPath, 0o755);
    }
  }
  return shimDir;
}

function createLocalNpmShim(appDirectory) {
  const npmCli = process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js')
    : path.resolve(path.dirname(process.execPath), '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js');
  if (!fs.existsSync(npmCli)) return;
  if (process.platform === 'win32') {
    fs.writeFileSync(
      path.join(appDirectory, 'npm.cmd'),
      `@echo off\r\n"${process.execPath}" "${npmCli}" %*\r\nexit /b %ERRORLEVEL%\r\n`,
      'utf8',
    );
  } else {
    const npmShimPath = path.join(appDirectory, 'npm');
    fs.writeFileSync(npmShimPath, `#!/usr/bin/env sh\nexec "${process.execPath}" "${npmCli}" "$@"\n`, 'utf8');
    fs.chmodSync(npmShimPath, 0o755);
  }
}

function withPrependedPath(environment, shimDir) {
  const pathValue = environment.PATH ?? environment.Path ?? '';
  const nextPath = `${shimDir}${path.delimiter}${pathValue}`;
  return {
    ...environment,
    PATH: nextPath,
    // Windows environment blocks can expose both spellings. Keep them
    // aligned so child shells cannot discard the process-local toolchain.
    Path: nextPath,
  };
}

export function createBuildEnvironment(allowedValues, baseEnvironment, shimDir) {
  const environment = {};
  for (const key of SAFE_HOST_ENV_KEYS) {
    if (baseEnvironment[key] !== undefined) environment[key] = baseEnvironment[key];
  }
  Object.assign(environment, allowedValues, {
    NEXT_TELEMETRY_DISABLED: '1',
  });
  return withPrependedPath(environment, shimDir);
}

function createDeployEnvironment(allowedValues, baseEnvironment, shimDir) {
  const environment = createBuildEnvironment(allowedValues, baseEnvironment, shimDir);
  for (const key of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_API_KEY', 'CLOUDFLARE_EMAIL', 'CLOUDFLARE_ACCOUNT_ID']) {
    if (baseEnvironment[key] !== undefined) environment[key] = baseEnvironment[key];
  }
  return environment;
}

function copyRepositoryWithoutBuildOrEnvFiles(destination) {
  const ignoredDirectories = new Set([
    '.git', '.next', '.open-next', '.turbo', '.wrangler', '.expo',
    'coverage', 'node_modules', '.claude', '.regional-cache',
    '.national-cache', '.scale-cache', '.national-chunk-cache',
  ]);
  const copyOptions = {
    recursive: true,
    filter(source) {
      const relative = path.relative(repoRoot, source);
      if (!relative) return true;
      const parts = relative.split(path.sep);
      if (parts.some((part) => ignoredDirectories.has(part))) return false;
      if (parts.some((part) => part === '.env' || part.startsWith('.env.'))) return false;
      return true;
    },
  };
  const workspaceInputs = [
    'apps/web',
    'packages',
    'package.json',
    'pnpm-lock.yaml',
    'pnpm-workspace.yaml',
    '.npmrc',
    '.nvmrc',
    'tsconfig.base.json',
    'turbo.json',
    'eslint.config.mjs',
    '.prettierrc.json',
  ];
  for (const relative of workspaceInputs) {
    const source = path.join(repoRoot, relative);
    if (!fs.existsSync(source)) continue;
    fs.cpSync(source, path.join(destination, relative), copyOptions);
  }
}

function run(command, args, cwd, environment, { shell = process.platform === 'win32' } = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: environment,
    stdio: 'inherit',
    shell,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with exit code ${result.status ?? 'unknown'}`);
  }
}

function openNextCliPath() {
  const packageEntry = requireFromScript.resolve('@opennextjs/cloudflare', { paths: [repoRoot] });
  return path.join(path.dirname(packageEntry), '..', 'cli', 'index.js');
}

function copyArtifact(source, destination) {
  fs.rmSync(destination, { recursive: true, force: true });
  fs.cpSync(source, destination, { recursive: true });
}

export function extractCliOptions(args) {
  let envFilePath;
  const openNextArgs = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--env-file') {
      envFilePath = path.resolve(args[++index]);
    } else if (arg.startsWith('--env-file=')) {
      envFilePath = path.resolve(arg.slice('--env-file='.length));
    } else {
      openNextArgs.push(arg);
    }
  }
  return { envFilePath, openNextArgs };
}

export async function runWorkersBuild({
  mode = 'build',
  envFilePath = path.join(repoRoot, '.env'),
  openNextArgs = [],
  baseEnvironment = process.env,
} = {}) {
  if (!['build', 'preview', 'deploy'].includes(mode)) {
    throw new Error(`Unsupported Workers command: ${mode}`);
  }
  const { allowedValues, forbiddenValues } = loadEnvironment({ envFilePath, baseEnvironment });
  const sandboxRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'whilom-workers-'));
  try {
    copyRepositoryWithoutBuildOrEnvFiles(sandboxRoot);
    const shimDir = createPnpmShim(sandboxRoot);
    const sandboxApp = path.join(sandboxRoot, 'apps', 'web');
    createLocalNpmShim(sandboxApp);
    const buildEnvironment = createBuildEnvironment(allowedValues, baseEnvironment, shimDir);

    console.log('Workers build: restoring the frozen workspace inside the isolated directory.');
    run(
      'pnpm',
      ['install', '--frozen-lockfile', '--prefer-offline', '--ignore-scripts', '--filter', '@whilom/web...'],
      sandboxRoot,
      buildEnvironment,
    );
    // OpenNext 1.20.4 reads .env files both while it runs Next in standalone
    // mode and during its own compileEnvFiles stage. Create only the
    // allowlisted file for that complete build, then remove it before
    // auditing/copying the generated artifact.
    const sanitizedEnvPath = path.join(sandboxRoot, '.env');
    writeSanitizedEnv(sanitizedEnvPath, allowedValues);
    try {
      console.log('Workers build: running the sanitized Next.js and OpenNext standalone build.');
      const buildArgs = ['build', ...openNextArgs];
      run(
        process.execPath,
        [openNextCliPath(), ...buildArgs],
        path.join(sandboxRoot, 'apps', 'web'),
        buildEnvironment,
        { shell: false },
      );
    } finally {
      fs.rmSync(sanitizedEnvPath, { force: true });
    }

    const sandboxArtifact = path.join(sandboxApp, '.open-next');
    const sandboxWranglerConfig = path.join(sandboxApp, 'wrangler.jsonc');
    auditWorkersArtifact({
      artifactDir: sandboxArtifact,
      wranglerConfigPath: sandboxWranglerConfig,
      requiredEnv: allowedValues,
      forbiddenValues,
    });
    copyArtifact(sandboxArtifact, actualArtifactDir);
    auditWorkersArtifact({
      artifactDir: actualArtifactDir,
      wranglerConfigPath: path.join(appSource, 'wrangler.jsonc'),
      requiredEnv: allowedValues,
      forbiddenValues,
    });
    console.log('Workers build: artifact audit passed before output was exposed to the app workspace.');

    if (mode !== 'build') {
      const deploymentEnvironment = mode === 'deploy'
        ? createDeployEnvironment(allowedValues, baseEnvironment, shimDir)
        : buildEnvironment;
      run(
        process.execPath,
        [openNextCliPath(), mode, ...openNextArgs],
        sandboxApp,
        deploymentEnvironment,
        { shell: false },
      );
    }
    return { artifactDir: actualArtifactDir, allowedValues };
  } finally {
    fs.rmSync(sandboxRoot, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [requestedMode = 'build', ...args] = process.argv.slice(2);
  const { envFilePath, openNextArgs } = extractCliOptions(args);
  runWorkersBuild({ mode: requestedMode, envFilePath, openNextArgs }).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
