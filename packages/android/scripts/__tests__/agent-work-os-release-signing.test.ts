import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const androidRoot = resolve('packages/android');
const scriptPath = resolve(androidRoot, 'scripts/agent-work-os-release-signing.mjs');

describe('agent-work-os-release-signing script', () => {
  it('supports dry-run initialization without writing signing files', () => {
    const storeFile = 'keystores/nimbalyst-release-dry-run-test.jks';
    const storePath = resolve(androidRoot, storeFile);
    const result = spawnSync(process.execPath, [
      scriptPath,
      'init',
      '--dry-run',
      '--store-file',
      storeFile,
      '--alias',
      'dry-run-test',
    ], {
      cwd: resolve('.'),
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Would create keystore');
    expect(result.stdout).toContain('dry-run-test');
    expect(existsSync(storePath)).toBe(false);
  });
});
