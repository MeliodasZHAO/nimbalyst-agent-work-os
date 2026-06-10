import { afterEach, describe, expect, it } from 'vitest';
import {
  applyTrackerTypeToMarkdown,
  getFullDocumentTrackerTypes,
} from '../TrackerTypeHelper';

afterEach(() => {
  delete (globalThis as any).window;
});

describe('TrackerTypeHelper', () => {
  it('returns registered full-document tracker types', () => {
    (globalThis as any).window = {
      __trackerRegistry: {
        getAll: () => [
          {
            type: 'work-packet',
            displayName: 'Work Packet',
            icon: 'assignment',
            color: '#2563eb',
            modes: { fullDocument: true },
          },
          {
            type: 'bug',
            displayName: 'Bug',
            icon: 'bug_report',
            color: '#dc2626',
            modes: { inline: true },
          },
        ],
      },
    };

    expect(getFullDocumentTrackerTypes()).toEqual([
      {
        type: 'work-packet',
        displayName: 'Work Packet',
        icon: 'assignment',
        color: '#2563eb',
      },
    ]);
  });

  it('falls back to built-in full-document tracker types without a registry', () => {
    expect(getFullDocumentTrackerTypes().map(type => type.type)).toEqual(['plan', 'decision']);
  });

  it('adds a Work Packet body template for empty documents', () => {
    const markdown = applyTrackerTypeToMarkdown('', 'work-packet', {
      gate: 'spec',
      complexity: 'medium',
    });

    expect(markdown).toContain('trackerStatus:\n  type: work-packet');
    expect(markdown).toContain('## Intent');
    expect(markdown).toContain('## Success Criteria');
    expect(markdown).toContain('## Verification');
    expect(markdown).toContain('## Docs Gate');
  });

  it('keeps an existing title and adds the Work Packet body template', () => {
    const markdown = applyTrackerTypeToMarkdown('# Runtime fix\n', 'work-packet', {
      gate: 'spec',
    });

    expect(markdown).toContain('# Runtime fix');
    expect(markdown).toContain('## Scope');
  });

  it('does not overwrite existing body content with the Work Packet template', () => {
    const markdown = applyTrackerTypeToMarkdown('# Runtime fix\n\nExisting notes.\n', 'work-packet', {
      gate: 'spec',
    });

    expect(markdown).toContain('Existing notes.');
    expect(markdown).not.toContain('## Intent');
  });
});
