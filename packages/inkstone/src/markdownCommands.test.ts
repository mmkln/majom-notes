import { describe, expect, it } from 'vitest';

import {
  handleBackspaceInList,
  handleEnterInList,
  toggleLinePrefix,
  wrapSelectionAsLink,
  wrapSelectionInCodeFence,
  wrapSelectionWithToken,
} from './markdownCommands.ts';

describe('Markdown commands', () => {
  it('wraps a selected range and keeps the text selected', () => {
    expect(wrapSelectionWithToken('Hello', 0, 5, '**')).toEqual({
      value: '**Hello**',
      selection: { start: 2, end: 7 },
    });
  });

  it('creates a link and selects its URL', () => {
    expect(wrapSelectionAsLink('Docs', 0, 4)).toEqual({
      value: '[Docs](https://)',
      selection: { start: 7, end: 15 },
    });
  });

  it('wraps selected text in a fenced code block', () => {
    expect(wrapSelectionInCodeFence('const ok = true;', 0, 16, 'ts')).toEqual({
      value: '```ts\nconst ok = true;\n```',
      selection: { start: 6, end: 22 },
    });
  });

  it('continues and increments an ordered list', () => {
    expect(handleEnterInList('1. One', 6, 6)).toEqual({
      value: '1. One\n2. ',
      selection: { start: 10, end: 10 },
    });
  });

  it('removes an empty list marker on Enter', () => {
    expect(handleEnterInList('- ', 2, 2)).toEqual({
      value: '',
      selection: { start: 0, end: 0 },
    });
  });

  it('outdents before removing a list marker with Backspace', () => {
    expect(handleBackspaceInList('  - Item', 4, 4)).toEqual({
      value: '- Item',
      selection: { start: 2, end: 2 },
    });
  });

  it('toggles a prefix across all selected lines', () => {
    expect(toggleLinePrefix('One\nTwo', 0, 7, '- ').value).toBe('- One\n- Two');
    expect(toggleLinePrefix('- One\n- Two', 0, 11, '- ').value).toBe('One\nTwo');
  });
});
