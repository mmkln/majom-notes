import { describe, expect, it } from 'vitest';

import { createInkstoneMarkdownEngine } from './InkstoneMarkdownEngine.ts';

describe('InkstoneMarkdownEngine', () => {
  const engine = createInkstoneMarkdownEngine({ normalizeLineEndings: true });

  it('parses the supported block types and document statistics', () => {
    const document = engine.parse(
      '# Heading\n\nParagraph with **bold** and [link](https://example.test).\n- Item\n1. Ordered\n- [x] Done\n> Quote\n---\n```ts\nconst ok = true;\n```',
    );

    expect(document.blocks.map((block) => block.type)).toEqual([
      'heading',
      'blank',
      'paragraph',
      'bullet_list_item',
      'ordered_list_item',
      'task_list_item',
      'blockquote',
      'thematic_break',
      'code_fence',
    ]);
    expect(document.stats).toMatchObject({
      headings: 1,
      bulletItems: 1,
      orderedItems: 1,
      taskItems: 1,
      blockquotes: 1,
      thematicBreaks: 1,
      codeFences: 1,
    });
  });

  it('normalizes Windows line endings and preserves source offsets', () => {
    const document = engine.parse('First\r\nSecond');

    expect(document.normalized).toBe('First\nSecond');
    expect(document.blocks[1]).toMatchObject({
      text: 'Second',
      lineStart: 6,
      lineEnd: 12,
    });
  });

  it('creates a plain-text snippet from Markdown blocks', () => {
    expect(
      engine.createSnippet('# Heading\n- [ ] Task\n> Quote', {
        maxLength: 80,
        maxItems: 3,
      }).text,
    ).toBe('Heading · ☐ Task · "Quote"');
  });
});
