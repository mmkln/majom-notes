// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { createInkstoneMarkdownEngine } from './InkstoneMarkdownEngine.ts';
import { createInkstoneMirrorRenderer } from './InkstoneMirrorRenderer.ts';

const engine = createInkstoneMarkdownEngine({ normalizeLineEndings: true });

function render(source: string, profile: 'editor' | 'preview' = 'editor') {
  const host = document.createElement('div');
  createInkstoneMirrorRenderer({ profile }).render(host, engine.parse(source));
  return host;
}

describe('InkstoneMirrorRenderer', () => {
  it('keeps inline Markdown syntax in the editor layout footprint', () => {
    const source = '**bold** _italic_ *also italic* `code` [link](https://example.test)';
    const host = render(source);
    const line = host.querySelector<HTMLElement>('[data-inkstone-role="line"]');

    expect(line?.textContent).toBe(source);
    expect(
      line?.querySelectorAll('[data-inkstone-role="syntax"]'),
    ).toHaveLength(10);
    expect(line?.querySelector<HTMLElement>('.inkstone-inline--emphasis')?.textContent).toBe(
      'italic',
    );
  });

  it('preserves heading and blockquote prefixes in the editor layout footprint', () => {
    const source = '## Heading\n> Quote';
    const host = render(source);
    const lines = host.querySelectorAll<HTMLElement>('[data-inkstone-role="line"]');

    expect(lines[0]?.textContent).toBe('## Heading');
    expect(lines[1]?.textContent).toBe('> Quote');
    expect(lines[0]?.querySelector('[data-inkstone-role="syntax"]')?.textContent).toBe('## ');
    expect(lines[1]?.querySelector('[data-inkstone-role="syntax"]')?.textContent).toBe('> ');
  });

  it('keeps code-fence rows and thematic breaks geometry-compatible in editor mode', () => {
    const source = '---\n```ts\nconst ok = true;\n```\nAfter';
    const host = render(source);
    const lines = host.querySelectorAll<HTMLElement>('[data-inkstone-role="line"]');
    const dividerLine = lines[0];
    const codeLine = lines[1];

    expect(dividerLine?.textContent).toBe('---');
    expect(dividerLine?.style.paddingTop).toBe('');
    expect(dividerLine?.querySelector<HTMLElement>('[data-inkstone-role="divider"]')?.style.position).toBe(
      'absolute',
    );
    expect(codeLine?.textContent).toBe('```ts\nconst ok = true;\n```');
    expect(codeLine?.querySelector('.inkstone-code-fence-content')?.textContent).toBe(
      'const ok = true;',
    );
    expect(lines[2]?.textContent).toBe('After');
  });

  it('does not duplicate the newline in an empty code fence', () => {
    const source = '```\n```';
    const host = render(source);
    const line = host.querySelector<HTMLElement>('[data-inkstone-role="line"]');

    expect(line?.textContent).toBe(source);
    expect(line?.querySelector('.inkstone-code-fence-content')?.textContent).toBe('');
  });

  it('uses semantic output without hidden source syntax in preview mode', () => {
    const host = render('## **Heading**\n---\n```ts\nconst ok = true;\n```', 'preview');

    expect(host.querySelector('[data-inkstone-role="syntax"]')).toBeNull();
    expect(host.querySelector('.inkstone-inline--strong')?.textContent).toBe('Heading');
    expect(host.querySelector('[data-inkstone-role="divider"]')).not.toBeNull();
    expect(host.querySelector('pre')?.textContent).toBe('const ok = true;');
  });
});
