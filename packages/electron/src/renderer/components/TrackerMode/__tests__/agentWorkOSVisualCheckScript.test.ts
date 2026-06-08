import { describe, expect, it } from 'vitest';

describe('agent-work-os visual check script', () => {
  it('exports runVisualCheck and validates viewport options before connecting to CDP', async () => {
    // @ts-expect-error Executable ESM script intentionally has no TypeScript declaration file.
    const module = await import('../../../../../scripts/agent-work-os-visual-check.mjs');

    expect(typeof module.runVisualCheck).toBe('function');
    await expect(module.runVisualCheck({
      desktop: false,
      mobile: false,
      outputDir: 'unused',
    })).rejects.toThrow('At least one viewport must be enabled.');
  });
});
