// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import { createInkstoneEditor } from './InkstoneEditor.ts';

describe('InkstoneEditor', () => {
  it('executes a public formatting command and updates the document', () => {
    const onChange = vi.fn();
    const editor = createInkstoneEditor({ value: 'Hello', onChange });
    const input = editor.getInputElement();
    document.body.appendChild(editor.element);
    input.focus();
    input.setSelectionRange(0, 5);

    editor.executeCommand({ type: 'bold' });

    expect(editor.getValue()).toBe('**Hello**');
    expect(input.selectionStart).toBe(2);
    expect(input.selectionEnd).toBe(7);
    expect(editor.getDocument().blocks[0]?.segments?.[0]).toEqual({
      type: 'strong',
      text: 'Hello',
    });
    expect(onChange).toHaveBeenLastCalledWith('**Hello**');
    editor.destroy();
  });

  it('supports the corrected primary-modifier bullet shortcut', () => {
    const editor = createInkstoneEditor({ value: 'Item' });
    const input = editor.getInputElement();
    document.body.appendChild(editor.element);
    input.focus();
    input.setSelectionRange(0, 4);

    input.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: '*',
        code: 'Digit8',
        ctrlKey: true,
        shiftKey: true,
        bubbles: true,
      }),
    );

    expect(editor.getValue()).toBe('- Item');
    editor.destroy();
  });
});
