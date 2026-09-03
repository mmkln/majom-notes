export type InkstoneMarkdownBlockType =
  | 'heading'
  | 'paragraph'
  | 'thematic_break'
  | 'bullet_list_item'
  | 'ordered_list_item'
  | 'task_list_item'
  | 'blockquote'
  | 'code_fence'
  | 'blank';

export type InkstoneMarkdownInlineSegment =
  | { type: 'text'; text: string }
  | { type: 'strong'; text: string }
  | { type: 'emphasis'; text: string; marker: '*' | '_' }
  | { type: 'code'; text: string }
  | { type: 'link'; text: string; label: string; href: string };

export type InkstoneMarkdownBlock = {
  type: InkstoneMarkdownBlockType;
  text: string;
  rawText: string;
  lineStart: number;
  lineEnd: number;
  level?: number;
  checked?: boolean;
  marker?: string;
  language?: string | null;
  segments?: InkstoneMarkdownInlineSegment[];
};

export type InkstoneMarkdownDocument = {
  source: string;
  normalized: string;
  blocks: InkstoneMarkdownBlock[];
  stats: {
    headings: number;
    thematicBreaks: number;
    bulletItems: number;
    orderedItems: number;
    taskItems: number;
    blockquotes: number;
    codeFences: number;
  };
};

export type InkstoneMarkdownEngineOptions = {
  normalizeLineEndings?: boolean;
};

export type InkstoneMarkdownSnippetItem = {
  blockType: InkstoneMarkdownBlockType;
  text: string;
};

export type InkstoneMarkdownSnippet = {
  text: string;
  items: InkstoneMarkdownSnippetItem[];
  truncated: boolean;
};

function normalizeLineEndings(value: string): string {
  return value.replace(/\r\n?/g, '\n');
}

function parseInlineSegments(text: string): InkstoneMarkdownInlineSegment[] {
  const segments: InkstoneMarkdownInlineSegment[] = [];
  let cursor = 0;

  const pushText = (value: string): void => {
    if (value.length === 0) return;
    segments.push({ type: 'text', text: value });
  };

  while (cursor < text.length) {
    if (text.startsWith('**', cursor)) {
      const end = text.indexOf('**', cursor + 2);
      if (end > cursor + 2) {
        segments.push({
          type: 'strong',
          text: text.slice(cursor + 2, end),
        });
        cursor = end + 2;
        continue;
      }
    }

    if (text[cursor] === '`') {
      const end = text.indexOf('`', cursor + 1);
      if (end > cursor + 1) {
        segments.push({
          type: 'code',
          text: text.slice(cursor + 1, end),
        });
        cursor = end + 1;
        continue;
      }
    }

    if (text[cursor] === '*' || text[cursor] === '_') {
      const token = text[cursor] as '*' | '_';
      const end = text.indexOf(token, cursor + 1);
      if (end > cursor + 1) {
        segments.push({
          type: 'emphasis',
          text: text.slice(cursor + 1, end),
          marker: token,
        });
        cursor = end + 1;
        continue;
      }
    }

    if (text[cursor] === '[') {
      const labelEnd = text.indexOf('](', cursor);
      if (labelEnd !== -1) {
        const hrefEnd = text.indexOf(')', labelEnd + 2);
        if (hrefEnd !== -1) {
          segments.push({
            type: 'link',
            text: text.slice(cursor, hrefEnd + 1),
            label: text.slice(cursor + 1, labelEnd),
            href: text.slice(labelEnd + 2, hrefEnd),
          });
          cursor = hrefEnd + 1;
          continue;
        }
      }
    }

    let nextSpecial = text.length;
    ['**', '`', '*', '_', '['].forEach((token) => {
      const index = text.indexOf(token, cursor + 1);
      if (index !== -1 && index < nextSpecial) {
        nextSpecial = index;
      }
    });

    pushText(text.slice(cursor, nextSpecial));
    cursor = nextSpecial;
  }

  return segments;
}

function getInlinePlainText(
  text: string,
  segments: InkstoneMarkdownInlineSegment[] | undefined
): string {
  if (!segments || segments.length === 0) {
    return text;
  }

  return segments
    .map((segment) => {
      if (segment.type === 'link') {
        return segment.label;
      }
      return segment.text;
    })
    .join('');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function formatSnippetItemText(block: InkstoneMarkdownBlock): string {
  const plainText = collapseWhitespace(
    getInlinePlainText(block.text, block.segments)
  );

  if (plainText.length === 0) {
    return '';
  }

  if (block.type === 'bullet_list_item') {
    return `• ${plainText}`;
  }

  if (block.type === 'ordered_list_item') {
    return `${(block.marker ?? '1.').trim()} ${plainText}`;
  }

  if (block.type === 'task_list_item') {
    return `${block.checked ? '☑' : '☐'} ${plainText}`;
  }

  if (block.type === 'blockquote') {
    return `"${plainText}"`;
  }

  if (block.type === 'code_fence') {
    const firstCodeLine = collapseWhitespace(
      block.text.split('\n').find((line) => line.trim().length > 0) ?? ''
    );
    if (firstCodeLine.length > 0) {
      return `Code: ${firstCodeLine}`;
    }
    return block.language ? `${block.language} code` : 'Code block';
  }

  return plainText;
}

function truncateSnippetText(
  value: string,
  maxLength: number
): { text: string; truncated: boolean } {
  if (value.length <= maxLength) {
    return { text: value, truncated: false };
  }

  const sliced = value.slice(0, Math.max(0, maxLength - 1));
  const lastBreak = Math.max(
    sliced.lastIndexOf(' '),
    sliced.lastIndexOf('·')
  );
  const base =
    lastBreak >= Math.floor(maxLength * 0.6)
      ? sliced.slice(0, lastBreak).trim()
      : sliced.trim();
  return {
    text: `${base}…`,
    truncated: true,
  };
}

function parseLine(
  line: string,
  lineStart: number,
  lineEnd: number
): InkstoneMarkdownBlock {
  if (line.trim().length === 0) {
    return {
      type: 'blank',
      text: '',
      rawText: '',
      lineStart,
      lineEnd,
    };
  }

  const headingMatch = line.match(/^(#{1,6})\s+(.*)$/);
  if (headingMatch) {
    return {
      type: 'heading',
      text: headingMatch[2],
      rawText: line,
      lineStart,
      lineEnd,
      level: headingMatch[1].length,
      marker: headingMatch[1],
      segments: parseInlineSegments(headingMatch[2]),
    };
  }

  const thematicBreakMatch = line.match(/^\s*([-*_])(?:\s*\1){2,}\s*$/);
  if (thematicBreakMatch) {
    return {
      type: 'thematic_break',
      text: '',
      rawText: line,
      lineStart,
      lineEnd,
      marker: thematicBreakMatch[1],
    };
  }

  const taskMatch = line.match(/^(\s*(?:[-*]|\d+\.))\s+\[([ xX])\]\s+(.*)$/);
  if (taskMatch) {
    return {
      type: 'task_list_item',
      text: taskMatch[3],
      rawText: line,
      lineStart,
      lineEnd,
      checked: taskMatch[2].toLowerCase() === 'x',
      marker: taskMatch[1],
      segments: parseInlineSegments(taskMatch[3]),
    };
  }

  const bulletMatch = line.match(/^(\s*[-*])\s+(.*)$/);
  if (bulletMatch) {
    return {
      type: 'bullet_list_item',
      text: bulletMatch[2],
      rawText: line,
      lineStart,
      lineEnd,
      marker: bulletMatch[1],
      segments: parseInlineSegments(bulletMatch[2]),
    };
  }

  const orderedMatch = line.match(/^(\s*\d+\.)\s+(.*)$/);
  if (orderedMatch) {
    return {
      type: 'ordered_list_item',
      text: orderedMatch[2],
      rawText: line,
      lineStart,
      lineEnd,
      marker: orderedMatch[1],
      segments: parseInlineSegments(orderedMatch[2]),
    };
  }

  const quoteMatch = line.match(/^>\s?(.*)$/);
  if (quoteMatch) {
    return {
      type: 'blockquote',
      text: quoteMatch[1],
      rawText: line,
      lineStart,
      lineEnd,
      marker: '>',
      segments: parseInlineSegments(quoteMatch[1]),
    };
  }

  return {
    type: 'paragraph',
    text: line,
    rawText: line,
    lineStart,
    lineEnd,
    segments: parseInlineSegments(line),
  };
}

export class InkstoneMarkdownEngine {
  constructor(private readonly options: InkstoneMarkdownEngineOptions = {}) {}

  public normalize(value: string): string {
    if (this.options.normalizeLineEndings === false) {
      return value;
    }
    return normalizeLineEndings(value);
  }

  public parse(value: string): InkstoneMarkdownDocument {
    const normalized = this.normalize(value);
    const lines = normalized.split('\n');
    const blocks: InkstoneMarkdownBlock[] = [];
    const stats = {
      headings: 0,
      thematicBreaks: 0,
      bulletItems: 0,
      orderedItems: 0,
      taskItems: 0,
      blockquotes: 0,
      codeFences: 0,
    };

    const lineOffsets: number[] = [];
    let offsetCursor = 0;
    lines.forEach((line, index) => {
      lineOffsets.push(offsetCursor);
      offsetCursor += line.length;
      if (index < lines.length - 1) {
        offsetCursor += 1;
      }
    });

    let index = 0;
    while (index < lines.length) {
      const line = lines[index] ?? '';
      const lineStart = lineOffsets[index] ?? 0;
      const lineEnd = lineStart + line.length;
      const fenceMatch = line.match(/^```(.*)$/);
      if (fenceMatch) {
        const codeLines: string[] = [];
        let closingIndex = index + 1;
        while (closingIndex < lines.length && !lines[closingIndex]?.match(/^```/)) {
          codeLines.push(lines[closingIndex] ?? '');
          closingIndex += 1;
        }

        const finalLineIndex =
          closingIndex < lines.length ? closingIndex : lines.length - 1;
        const finalLineStart = lineOffsets[finalLineIndex] ?? lineStart;
        const finalLineEnd =
          finalLineStart + (lines[finalLineIndex] ?? '').length;
        const rawEnd = finalLineEnd;
        const rawText = normalized.slice(lineStart, rawEnd);

        blocks.push({
          type: 'code_fence',
          text: codeLines.join('\n'),
          rawText,
          lineStart,
          lineEnd: rawEnd,
          language: fenceMatch[1].trim() || null,
          marker: '```',
        });
        stats.codeFences += 1;
        index = closingIndex < lines.length ? closingIndex + 1 : lines.length;
        continue;
      }

      const block = parseLine(line, lineStart, lineEnd);
      blocks.push(block);

      if (block.type === 'heading') stats.headings += 1;
      if (block.type === 'thematic_break') stats.thematicBreaks += 1;
      if (block.type === 'bullet_list_item') stats.bulletItems += 1;
      if (block.type === 'ordered_list_item') stats.orderedItems += 1;
      if (block.type === 'task_list_item') stats.taskItems += 1;
      if (block.type === 'blockquote') stats.blockquotes += 1;
      if (block.type === 'code_fence') stats.codeFences += 1;

      index += 1;
    }

    return {
      source: value,
      normalized,
      blocks,
      stats,
    };
  }

  public createSnippet(
    valueOrDocument: string | InkstoneMarkdownDocument,
    options: {
      maxLength?: number;
      maxItems?: number;
    } = {}
  ): InkstoneMarkdownSnippet {
    const document =
      typeof valueOrDocument === 'string'
        ? this.parse(valueOrDocument)
        : valueOrDocument;
    const maxItems = Math.max(1, options.maxItems ?? 3);
    const maxLength = Math.max(1, options.maxLength ?? 120);

    const items: InkstoneMarkdownSnippetItem[] = [];

    document.blocks.forEach((block) => {
      if (items.length >= maxItems) {
        return;
      }
      if (block.type === 'blank' || block.type === 'thematic_break') {
        return;
      }

      const text = formatSnippetItemText(block);
      if (text.length === 0) {
        return;
      }

      items.push({
        blockType: block.type,
        text,
      });
    });

    const joinedText = items.map((item) => item.text).join(' · ');
    const truncated = truncateSnippetText(joinedText, maxLength);

    return {
      text: truncated.text,
      items,
      truncated: truncated.truncated,
    };
  }
}

export function createInkstoneMarkdownEngine(
  options: InkstoneMarkdownEngineOptions = {}
): InkstoneMarkdownEngine {
  return new InkstoneMarkdownEngine(options);
}
