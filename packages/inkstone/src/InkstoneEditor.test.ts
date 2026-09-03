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

  it('toggles a rendered task without moving the editor selection', () => {
    const onChange = vi.fn();
    const editor = createInkstoneEditor({
      value: '- [ ] Task\nAfter',
      onChange,
    });
    const input = editor.getInputElement();
    document.body.appendChild(editor.element);
    input.focus();
    input.setSelectionRange(13, 13);
    input.dispatchEvent(new Event('select'));

    const toggle = editor.element.querySelector<HTMLButtonElement>(
      '[data-inkstone-task-toggle="true"]',
    );
    toggle?.dispatchEvent(new MouseEvent('click', { bubbles: true }));

    expect(editor.getValue()).toBe('- [x] Task\nAfter');
    expect(input.selectionStart).toBe(13);
    expect(input.selectionEnd).toBe(13);
    expect(onChange).toHaveBeenLastCalledWith('- [x] Task\nAfter');
    expect(
      editor.element.querySelector<HTMLElement>(
        '[data-inkstone-task-toggle="true"]',
      )?.dataset.checked,
    ).toBe('true');
    editor.destroy();
  });

  it('matches the mirror viewport to the textarea width excluding its scrollbar', () => {
    const editor = createInkstoneEditor({ value: 'A long note' });
    const input = editor.getInputElement();
    Object.defineProperty(input, 'offsetWidth', { configurable: true, value: 360 });
    Object.defineProperty(input, 'clientWidth', { configurable: true, value: 345 });

    editor.mount(document.body);

    expect(
      editor.element.querySelector<HTMLElement>('[data-inkstone-role="mirror"]')
        ?.style.right,
    ).toBe('15px');
    editor.destroy();
  });

  it('lets the mirror render the placeholder without a visible native duplicate', () => {
    const editor = createInkstoneEditor({
      value: '',
      placeholder: 'Write a note',
    });
    const input = editor.getInputElement();

    expect(input.placeholder).toBe('Write a note');
    expect(input.style.webkitTextFillColor).toBe('transparent');
    expect(input.style.caretColor).toBe('var(--editor-accent, #7352dc)');
    expect(
      editor.element.querySelector('[data-inkstone-role="placeholder"]')?.textContent,
    ).toBe('Write a note');
    editor.destroy();
  });
});
