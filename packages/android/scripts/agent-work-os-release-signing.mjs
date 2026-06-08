#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const androidRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const localPropertiesPath = resolve(androidRoot, 'local.properties');
const defaultStoreFile = 'keystores/nimbalyst-release.jks';
const defaultAlias = 'nimbalyst-release';

function parseArgs(argv) {
  const args = {
    command: 'verify',
    dryRun: false,
    force: false,
    storeFile: defaultStoreFile,
    alias: defaultAlias,
    storePassword: '',
    keyPassword: '',
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === 'init' || arg === 'verify') {
      args.command = arg;
    } else if (arg === '--dry-run') {
      args.dryRun = true;
    } else if (arg === '--force') {
      args.force = true;
    } else if (arg === '--store-file') {
      args.storeFile = argv[++index] ?? args.storeFile;
    } else if (arg === '--alias') {
      args.alias = argv[++index] ?? args.alias;
    } else if (arg === '--store-password') {
      args.storePassword = argv[++index] ?? '';
    } else if (arg === '--key-password') {
      args.keyPassword = argv[++index] ?? '';
    } else if (arg === '--help' || arg === '-h') {
      args.command = 'help';
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp() {
  console.log(`Agent Work OS Android release signing

Usage:
  node scripts/agent-work-os-release-signing.mjs init [--force] [--dry-run]
  node scripts/agent-work-os-release-signing.mjs verify

Options:
  --store-file <path>       Keystore path relative to packages/android
  --alias <name>            Release key alias
  --store-password <value>  Optional explicit store password
  --key-password <value>    Optional explicit key password
  --force                   Replace an existing keystore/local signing block
  --dry-run                 Print actions without writing files or invoking keytool
`);
}

function readProperties(path) {
  if (!existsSync(path)) return new Map();
  const map = new Map();
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    map.set(trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim());
  }
  return map;
}

function serializeSigningBlock(values) {
  return [
    '',
    '# Agent Work OS Android release signing',
    `NIMBALYST_RELEASE_STORE_FILE=${values.storeFile}`,
    `NIMBALYST_RELEASE_STORE_PASSWORD=${values.storePassword}`,
    `NIMBALYST_RELEASE_KEY_ALIAS=${values.alias}`,
    `NIMBALYST_RELEASE_KEY_PASSWORD=${values.keyPassword}`,
    '',
  ].join('\n');
}

function nextPassword() {
  return randomBytes(24).toString('base64url');
}

function findKeytool() {
  const command = process.platform === 'win32' ? 'keytool.exe' : 'keytool';
  const javaHome = process.env.JAVA_HOME;
  if (javaHome) {
    const candidate = resolve(javaHome, 'bin', command);
    if (existsSync(candidate)) return candidate;
  }
  return command;
}

function verify() {
  const properties = readProperties(localPropertiesPath);
  const required = [
    'NIMBALYST_RELEASE_STORE_FILE',
    'NIMBALYST_RELEASE_STORE_PASSWORD',
    'NIMBALYST_RELEASE_KEY_ALIAS',
    'NIMBALYST_RELEASE_KEY_PASSWORD',
  ];
  const missing = required.filter(key => !properties.get(key));
  if (missing.length > 0) {
    return {
      ok: false,
      message: `Missing release signing values: ${missing.join(', ')}`,
    };
  }
  const storePath = resolve(androidRoot, properties.get('NIMBALYST_RELEASE_STORE_FILE'));
  if (!existsSync(storePath)) {
    return {
      ok: false,
      message: `Keystore does not exist: ${storePath}`,
    };
  }
  return {
    ok: true,
    message: `Release signing is configured for ${properties.get('NIMBALYST_RELEASE_KEY_ALIAS')}.`,
  };
}

function init(args) {
  const existing = verify();
  if (existing.ok && !args.force) {
    return {
      ok: true,
      message: `${existing.message} Use --force to regenerate local signing materials.`,
    };
  }

  const storePassword = args.storePassword || nextPassword();
  const keyPassword = args.keyPassword || nextPassword();
  const keystorePath = resolve(androidRoot, args.storeFile);
  const values = {
    storeFile: args.storeFile,
    storePassword,
    alias: args.alias,
    keyPassword,
  };

  if (args.dryRun) {
    return {
      ok: true,
      message: [
        `Would create keystore: ${keystorePath}`,
        `Would update: ${localPropertiesPath}`,
        `Alias: ${args.alias}`,
      ].join('\n'),
    };
  }

  mkdirSync(dirname(keystorePath), { recursive: true });
  if (existsSync(keystorePath) && !args.force) {
    return {
      ok: false,
      message: `Keystore already exists: ${keystorePath}. Use --force to replace local signing config.`,
    };
  }

  const keytool = findKeytool();
  const result = spawnSync(keytool, [
    '-genkeypair',
    '-v',
    '-keystore', keystorePath,
    '-alias', args.alias,
    '-keyalg', 'RSA',
    '-keysize', '4096',
    '-validity', '10000',
    '-storepass', storePassword,
    '-keypass', keyPassword,
    '-dname', 'CN=Nimbalyst Agent Work OS, OU=Local Release, O=Nimbalyst, L=Local, S=Local, C=US',
  ], {
    cwd: androidRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return {
      ok: false,
      message: result.stderr || result.stdout || 'keytool failed.',
    };
  }

  const existingText = existsSync(localPropertiesPath)
    ? readFileSync(localPropertiesPath, 'utf8').replace(/\r?\n# Agent Work OS Android release signing[\s\S]*?(?=\r?\n# |\s*$)/, '')
    : '';
  writeFileSync(localPropertiesPath, `${existingText.trimEnd()}${serializeSigningBlock(values)}`, 'utf8');
  return {
    ok: true,
    message: `Created release keystore and updated ${localPropertiesPath}.`,
  };
}

try {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === 'help') {
    printHelp();
    process.exit(0);
  }

  const result = args.command === 'init' ? init(args) : verify();
  console.log(result.message);
  process.exit(result.ok ? 0 : 1);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
