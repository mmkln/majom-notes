import type {
  InkstoneMarkdownBlock,
  InkstoneMarkdownDocument,
  InkstoneMarkdownInlineSegment,
} from './InkstoneMarkdownEngine.ts';

export type InkstoneMirrorRenderOptions = {
  placeholder?: string;
  activeBlockLineStart?: number | null;
};

export type InkstoneMirrorRenderMode = 'styled' | 'editing';
export type InkstoneMirrorRendererProfile = 'editor' | 'preview';

function applyLineStyles(
  line: HTMLDivElement,
  block: InkstoneMarkdownBlock,
  renderMode: InkstoneMirrorRenderMode,
  profile: InkstoneMirrorRendererProfile
): void {
  if (renderMode === 'editing') {
    line.style.color = '#475569';
    line.style.background = 'rgba(248, 250, 252, 0.78)';
    return;
  }

  if (block.type === 'heading') {
    const headingLevel = block.level ?? 1;
    line.style.color =
      headingLevel === 1
        ? '#27364a'
        : headingLevel === 2
          ? '#334155'
          : headingLevel === 3
            ? '#475569'
            : headingLevel === 4
              ? '#5b687a'
              : '#6b7280';
    line.style.textDecoration = 'none';

    if (profile === 'preview') {
      const headingScale =
        headingLevel === 1
          ? '1.2em'
          : headingLevel === 2
            ? '1.12em'
            : headingLevel === 3
              ? '1.05em'
              : headingLevel === 4
                ? '0.98em'
                : '0.93em';
      line.style.fontSize = headingScale;
      line.style.fontWeight =
        headingLevel === 1
          ? '700'
          : headingLevel === 2
            ? '650'
            : headingLevel <= 4
              ? '600'
              : '500';
      line.style.letterSpacing =
        headingLevel === 1 ? '-0.025em' : headingLevel === 2 ? '-0.02em' : '-0.01em';
    }

    return;
  }

  if (block.type === 'thematic_break') {
    if (profile === 'preview') {
      line.style.paddingTop = '0.4rem';
      line.style.paddingBottom = '0.4rem';
      line.style.display = 'flex';
      line.style.alignItems = 'center';
    } else {
      line.style.position = 'relative';
    }
    return;
  }

  if (block.type === 'blockquote') {
    line.style.boxShadow = 'inset 2px 0 0 rgba(148, 163, 184, 0.42)';
    line.style.color = '#526277';
    return;
  }

  if (block.type === 'code_fence') {
    line.style.background = 'rgba(226, 232, 240, 0.72)';
    line.style.color = '#475569';
    line.style.borderRadius = '0.6rem';
    return;
  }

  if (block.type === 'task_list_item') {
    line.style.color = '#475569';
    return;
  }

  if (block.type === 'bullet_list_item' || block.type === 'ordered_list_item') {
    line.style.color = '#475569';
    return;
  }

  line.style.color = '#475569';
}

function appendTextSpan(host: HTMLElement, text: string): void {
  const span = document.createElement('span');
  span.textContent = text;
  host.appendChild(span);
}

function renderInlineSegments(
  host: HTMLElement,
  segments: InkstoneMarkdownInlineSegment[] | undefined,
  profile: InkstoneMirrorRendererProfile
): void {
  if (!segments || segments.length === 0) {
    return;
  }

  segments.forEach((segment) => {
    if (segment.type === 'text') {
      appendTextSpan(host, segment.text);
      return;
    }

    if (segment.type === 'strong') {
      if (profile === 'editor') {
        appendHiddenSyntaxSpan(host, '**');
      }
      const strong = document.createElement('strong');
      strong.className = 'inkstone-inline inkstone-inline--strong';
      strong.textContent = segment.text;
      strong.style.color = '#243447';
      strong.style.fontWeight = profile === 'preview' ? '700' : 'inherit';
      strong.style.textDecoration = 'none';
      host.appendChild(strong);
      if (profile === 'editor') {
        appendHiddenSyntaxSpan(host, '**');
      }
      return;
    }

    if (segment.type === 'emphasis') {
      if (profile === 'editor') {
        appendHiddenSyntaxSpan(host, segment.marker);
      }
      const em = document.createElement('em');
      em.className = 'inkstone-inline inkstone-inline--emphasis';
      em.textContent = segment.text;
      em.style.color = '#526277';
      em.style.fontStyle = profile === 'preview' ? 'italic' : 'normal';
      em.style.textDecoration = 'none';
      host.appendChild(em);
      if (profile === 'editor') {
        appendHiddenSyntaxSpan(host, segment.marker);
      }
      return;
    }

    if (segment.type === 'code') {
      if (profile === 'editor') {
        appendHiddenSyntaxSpan(host, '`');
      }
      const code = document.createElement('code');
      code.className = 'inkstone-inline inkstone-inline--code';
      code.textContent = segment.text;
      code.style.color = '#475569';
      code.style.fontFamily = profile === 'preview' ? 'ui-monospace, SFMono-Regular, monospace' : 'inherit';
      code.style.background = 'rgba(226, 232, 240, 0.82)';
      if (profile === 'preview') {
        code.style.padding = '0.08rem 0.35rem';
        code.style.borderRadius = '0.4rem';
      }
      host.appendChild(code);
      if (profile === 'editor') {
        appendHiddenSyntaxSpan(host, '`');
      }
      return;
    }

    if (profile === 'editor') {
      appendHiddenSyntaxSpan(host, '[');
    }
    const link = document.createElement('span');
    link.className = 'inkstone-inline inkstone-inline--link';
    link.textContent = segment.label;
    link.style.color = '#1d4ed8';
    link.style.textDecoration = 'underline';
    link.style.textDecorationColor = 'rgba(29, 78, 216, 0.28)';
    link.dataset.inkstoneHref = segment.href;
    host.appendChild(link);
    if (profile === 'editor') {
      appendHiddenSyntaxSpan(host, `](${segment.href})`);
    }
  });
}

function createVisibleListMarker(block: InkstoneMarkdownBlock): HTMLElement {
  const marker = document.createElement('span');
  marker.className = 'inkstone-list-marker';
  const trimmedMarker = (block.marker ?? '').trim();
  marker.dataset.inkstoneRole = 'list-marker';
  marker.setAttribute('aria-hidden', 'true');
  marker.style.display = 'inline-flex';
  marker.style.alignItems = 'center';
  marker.style.justifyContent = 'center';
  marker.style.opacity = '1';
  marker.style.color = 'rgba(100, 116, 139, 0.78)';
  marker.style.minWidth = block.type === 'ordered_list_item' ? '1.6rem' : '1rem';

  if (block.type === 'ordered_list_item') {
    marker.textContent = trimmedMarker;
    marker.style.fontSize = '0.82em';
    marker.style.fontWeight = '600';
    return marker;
  }

  marker.textContent = '•';
  marker.style.fontSize = '1em';
  marker.style.lineHeight = '1';
  return marker;
}

function appendHiddenSyntaxSpan(host: HTMLElement, text: string): HTMLSpanElement {
  const span = document.createElement('span');
  span.textContent = text;
  span.dataset.inkstoneRole = 'syntax';
  span.setAttribute('aria-hidden', 'true');
  span.style.visibility = 'hidden';
  span.style.whiteSpace = 'pre-wrap';
  host.appendChild(span);
  return span;
}

function appendEditorBlockPrefix(
  line: HTMLElement,
  block: InkstoneMarkdownBlock
): void {
  const prefixLength = Math.max(0, block.rawText.length - block.text.length);
  if (prefixLength > 0) {
    appendHiddenSyntaxSpan(line, block.rawText.slice(0, prefixLength));
  }
}

function appendEditorCodeFence(
  line: HTMLElement,
  block: InkstoneMarkdownBlock
): void {
  const openingLineEnd = block.rawText.indexOf('\n');
  if (openingLineEnd === -1) {
    appendHiddenSyntaxSpan(line, block.rawText);
    return;
  }

  const contentStart = openingLineEnd + 1;
  appendHiddenSyntaxSpan(line, block.rawText.slice(0, contentStart));
  const closingLineStart = block.rawText.lastIndexOf('\n');
  const hasClosingFence =
    closingLineStart >= openingLineEnd &&
    /^```/.test(block.rawText.slice(closingLineStart + 1));
  const emptyFence = hasClosingFence && closingLineStart === openingLineEnd;
  const contentEnd = hasClosingFence
    ? emptyFence
      ? contentStart
      : closingLineStart
    : block.rawText.length;

  const code = document.createElement('span');
  code.className = 'inkstone-code-fence-content';
  code.textContent = block.rawText.slice(contentStart, contentEnd);
  line.appendChild(code);

  if (hasClosingFence) {
    appendHiddenSyntaxSpan(
      line,
      block.rawText.slice(emptyFence ? contentStart : closingLineStart),
    );
  }
}

function createInlineSyntaxSlot(role: 'list-gutter' | 'task-gutter', rawSyntax: string): HTMLSpanElement {
  const slot = document.createElement('span');
  slot.dataset.inkstoneRole = role;
  slot.style.position = 'relative';
  slot.style.display = 'inline-block';
  slot.style.verticalAlign = 'top';
  slot.style.whiteSpace = 'pre';
  appendHiddenSyntaxSpan(slot, rawSyntax);
  return slot;
}

function appendEditorListPrefix(line: HTMLElement, block: InkstoneMarkdownBlock): void {
  const prefixMatch = block.rawText.match(/^(\s*)(\S+\s+)/);
  if (!prefixMatch) {
    return;
  }

  const [, indent, markerSyntax] = prefixMatch;
  if (indent.length > 0) {
    appendHiddenSyntaxSpan(line, indent);
  }

  const markerSlot = createInlineSyntaxSlot('list-gutter', markerSyntax);
  const marker = createVisibleListMarker(block);
  marker.style.position = 'absolute';
  marker.style.insetInline = '0';
  marker.style.top = '50%';
  marker.style.transform = 'translateY(-50%)';
  marker.style.width = '100%';
  markerSlot.appendChild(marker);
  line.appendChild(markerSlot);
}

function appendEditorTaskPrefix(
  line: HTMLElement,
  block: InkstoneMarkdownBlock
): HTMLButtonElement | null {
  const prefixLength = Math.max(0, block.rawText.length - block.text.length);
  const prefix = block.rawText.slice(0, prefixLength);
  const taskPrefixMatch = prefix.match(/^(\s*(?:[-*]|\d+\.)\s+)(\[[ xX]\]\s*)$/);
  if (!taskPrefixMatch) {
    return null;
  }

  const [, leaderSyntax, checkboxSyntax] = taskPrefixMatch;
  if (leaderSyntax.length > 0) {
    appendHiddenSyntaxSpan(line, leaderSyntax);
  }

  const checkboxSlot = createInlineSyntaxSlot('task-gutter', checkboxSyntax);
  const checkbox = document.createElement('button');
  checkbox.className = 'inkstone-task-checkbox';
  checkbox.type = 'button';
  checkbox.dataset.inkstoneTaskToggle = 'true';
  checkbox.dataset.inkstoneLineStart = String(block.lineStart);
  checkbox.dataset.checked = String(block.checked === true);
  checkbox.setAttribute(
    'aria-label',
    block.checked ? 'Mark task as incomplete' : 'Mark task as complete'
  );
  checkbox.style.pointerEvents = 'auto';
  checkbox.style.position = 'absolute';
  checkbox.style.left = '0';
  checkbox.style.top = '50%';
  checkbox.style.transform = 'translateY(-50%)';
  checkbox.style.display = 'inline-flex';
  checkbox.style.alignItems = 'center';
  checkbox.style.justifyContent = 'center';
  checkbox.style.width = '1rem';
  checkbox.style.height = '1rem';
  checkbox.style.borderRadius = '0.25rem';
  checkbox.style.border = '1px solid rgba(148, 163, 184, 0.85)';
  checkbox.style.background = block.checked ? '#475569' : 'transparent';
  checkbox.style.color = '#ffffff';
  checkbox.style.fontSize = '0.72rem';
  checkbox.style.lineHeight = '1';
  checkbox.textContent = block.checked ? '✓' : '';
  checkboxSlot.appendChild(checkbox);
  line.appendChild(checkboxSlot);
  return checkbox;
}

export class InkstoneMirrorRenderer {
  public constructor(
    private readonly profile: InkstoneMirrorRendererProfile = 'editor'
  ) {}

  public render(
    host: HTMLElement,
    markdownDocument: InkstoneMarkdownDocument,
    options: InkstoneMirrorRenderOptions = {}
  ): void {
    host.replaceChildren();

    if (markdownDocument.normalized.length === 0) {
      const placeholder = document.createElement('div');
      placeholder.dataset.inkstoneRole = 'placeholder';
      placeholder.textContent = options.placeholder ?? '';
      placeholder.style.color = 'rgba(148, 163, 184, 0.8)';
      placeholder.style.fontStyle = 'italic';
      host.appendChild(placeholder);
      return;
    }

    markdownDocument.blocks.forEach((block) => {
      host.appendChild(
        this.createLineElement(block, {
          renderMode:
            options.activeBlockLineStart === block.lineStart ? 'editing' : 'styled',
        })
      );
    });
  }

  public createLineElement(
    block: InkstoneMarkdownBlock,
    options: { renderMode?: InkstoneMirrorRenderMode } = {}
  ): HTMLDivElement {
    const renderMode = options.renderMode ?? 'styled';
    const line = document.createElement('div');
    line.classList.add(
      'inkstone-line',
      `inkstone-line--${block.type}`,
      `inkstone-line--${renderMode}`,
      `inkstone-line--profile-${this.profile}`,
    );
    line.dataset.inkstoneRole = 'line';
    line.dataset.inkstoneBlockType = block.type;
    line.dataset.inkstoneLineStart = String(block.lineStart);
    line.dataset.inkstoneRenderMode = renderMode;
    line.style.minHeight = '1lh';
    line.style.whiteSpace = 'pre-wrap';
    line.style.wordBreak = 'break-word';
    applyLineStyles(line, block, renderMode, this.profile);
    this.renderBlock(line, block, renderMode);
    return line;
  }

  private renderBlock(
    line: HTMLDivElement,
    block: InkstoneMarkdownBlock,
    renderMode: InkstoneMirrorRenderMode
  ): void {
    if (renderMode === 'editing') {
      line.textContent = block.type === 'blank' ? '\u00a0' : block.rawText || block.text;
      return;
    }

    if (block.type === 'blank') {
      line.textContent = '\u00a0';
      return;
    }

    if (block.type === 'thematic_break') {
      const divider = document.createElement('div');
      divider.dataset.inkstoneRole = 'divider';
      divider.setAttribute('aria-hidden', 'true');
      divider.style.height = '1px';
      divider.style.width = '100%';
      divider.style.backgroundColor = 'rgba(203, 213, 225, 0.6)';
      if (this.profile === 'editor') {
        appendHiddenSyntaxSpan(line, block.rawText);
        divider.style.position = 'absolute';
        divider.style.insetInline = '0';
        divider.style.top = '50%';
      }
      line.appendChild(divider);
      return;
    }

    if (block.type === 'heading') {
      if (this.profile === 'editor') {
        appendEditorBlockPrefix(line, block);
      }
      renderInlineSegments(line, block.segments, this.profile);
      return;
    }

    if (block.type === 'task_list_item') {
      if (this.profile === 'editor') {
        appendEditorTaskPrefix(line, block);
        const text = document.createElement('span');
        if (block.checked) {
          text.style.textDecoration = 'line-through';
          text.style.opacity = '0.75';
        }
        renderInlineSegments(text, block.segments, this.profile);
        line.appendChild(text);
        return;
      }

      const indentSpaces = (block.marker ?? '').match(/^\s*/)?.[0].length ?? 0;
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1.4rem minmax(0, 1fr)';
      row.style.columnGap = '0.45rem';
      row.style.alignItems = 'start';
      row.style.paddingLeft = indentSpaces > 0 ? `${indentSpaces * 0.9}rem` : '0';

      const checkboxCell = document.createElement('div');
      checkboxCell.dataset.inkstoneRole = 'task-gutter';
      checkboxCell.style.height = '1lh';
      checkboxCell.style.display = 'flex';
      checkboxCell.style.alignItems = 'center';
      checkboxCell.style.justifyContent = 'center';

      const checkbox = document.createElement('button');
      checkbox.className = 'inkstone-task-checkbox';
      checkbox.type = 'button';
      checkbox.dataset.inkstoneTaskToggle = 'true';
      checkbox.dataset.inkstoneLineStart = String(block.lineStart);
      checkbox.dataset.checked = String(block.checked === true);
      checkbox.setAttribute(
        'aria-label',
        block.checked ? 'Mark task as incomplete' : 'Mark task as complete'
      );
      checkbox.style.pointerEvents = 'auto';
      checkbox.style.display = 'inline-flex';
      checkbox.style.alignItems = 'center';
      checkbox.style.justifyContent = 'center';
      checkbox.style.width = '1rem';
      checkbox.style.height = '1rem';
      checkbox.style.borderRadius = '0.25rem';
      checkbox.style.border = '1px solid rgba(148, 163, 184, 0.85)';
      checkbox.style.background = block.checked ? '#475569' : 'transparent';
      checkbox.style.color = '#ffffff';
      checkbox.style.fontSize = '0.72rem';
      checkbox.style.lineHeight = '1';
      checkbox.textContent = block.checked ? '✓' : '';
      checkboxCell.appendChild(checkbox);
      row.appendChild(checkboxCell);

      const text = document.createElement('span');
      if (block.checked) {
        text.style.textDecoration = 'line-through';
        text.style.opacity = '0.75';
      }
      renderInlineSegments(text, block.segments, this.profile);
      row.appendChild(text);
      line.appendChild(row);
      return;
    }

    if (block.type === 'bullet_list_item' || block.type === 'ordered_list_item') {
      if (this.profile === 'editor') {
        appendEditorListPrefix(line, block);
        const text = document.createElement('span');
        renderInlineSegments(text, block.segments, this.profile);
        line.appendChild(text);
        return;
      }

      const indentSpaces = (block.marker ?? '').match(/^\s*/)?.[0].length ?? 0;
      const row = document.createElement('div');
      row.style.display = 'grid';
      row.style.gridTemplateColumns = '1.4rem minmax(0, 1fr)';
      row.style.columnGap = '0.45rem';
      row.style.alignItems = 'start';
      row.style.paddingLeft = indentSpaces > 0 ? `${indentSpaces * 0.9}rem` : '0';

      const markerCell = document.createElement('div');
      markerCell.dataset.inkstoneRole = 'list-gutter';
      markerCell.style.height = '1lh';
      markerCell.style.display = 'flex';
      markerCell.style.alignItems = 'center';
      markerCell.style.justifyContent = 'center';
      markerCell.appendChild(createVisibleListMarker(block));
      row.appendChild(markerCell);

      const text = document.createElement('span');
      renderInlineSegments(text, block.segments, this.profile);
      row.appendChild(text);
      line.appendChild(row);
      return;
    }

    if (block.type === 'blockquote') {
      if (this.profile === 'editor') {
        appendEditorBlockPrefix(line, block);
      }
      renderInlineSegments(line, block.segments, this.profile);
      return;
    }

    if (block.type === 'code_fence') {
      if (this.profile === 'editor') {
        appendEditorCodeFence(line, block);
        return;
      }

      const languageBadge = document.createElement('div');
      languageBadge.textContent = block.language ? block.language : 'code';
      languageBadge.style.fontSize = '0.72em';
      languageBadge.style.textTransform = 'uppercase';
      languageBadge.style.letterSpacing = '0.08em';
      languageBadge.style.opacity = '0.55';
      languageBadge.style.marginBottom = '0.35rem';
      line.appendChild(languageBadge);

      const code = document.createElement('pre');
      code.textContent = block.text || '\u00a0';
      code.style.margin = '0';
      code.style.whiteSpace = 'pre-wrap';
      code.style.wordBreak = 'break-word';
      line.appendChild(code);
      return;
    }

    renderInlineSegments(line, block.segments, this.profile);
  }
}

export function createInkstoneMirrorRenderer(options: {
  profile?: InkstoneMirrorRendererProfile;
} = {}): InkstoneMirrorRenderer {
  return new InkstoneMirrorRenderer(options.profile);
}
