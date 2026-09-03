type SelectionRange = {
  start: number;
  end: number;
};

type CommandResult = {
  value: string;
  selection: SelectionRange;
};

type ListLineMatch =
  | {
      type: 'task';
      indent: string;
      markerToken: string;
      checkboxToken: string;
      prefix: string;
      content: string;
    }
  | {
      type: 'bullet';
      indent: string;
      markerToken: string;
      prefix: string;
      content: string;
    }
  | {
      type: 'ordered';
      indent: string;
      markerToken: string;
      prefix: string;
      content: string;
    };

function normalizeRange(start: number, end: number): SelectionRange {
  return start <= end ? { start, end } : { start: end, end: start };
}

function replaceRange(
  value: string,
  range: SelectionRange,
  replacement: string
): string {
  return value.slice(0, range.start) + replacement + value.slice(range.end);
}

function getLineRange(value: string, position: number): SelectionRange {
  const lineStart = value.lastIndexOf('\n', Math.max(0, position - 1)) + 1;
  const lineBreakIndex = value.indexOf('\n', position);
  const lineEnd = lineBreakIndex === -1 ? value.length : lineBreakIndex;
  return { start: lineStart, end: lineEnd };
}

function parseListLine(line: string): ListLineMatch | null {
  const taskMatch = line.match(/^(\s*)([-*]|\d+\.)(\s+\[[ xX]\]\s?)(.*)$/);
  if (taskMatch) {
    return {
      type: 'task',
      indent: taskMatch[1],
      markerToken: taskMatch[2],
      checkboxToken: taskMatch[3],
      prefix: `${taskMatch[1]}${taskMatch[2]}${taskMatch[3]}`,
      content: taskMatch[4],
    };
  }

  const bulletMatch = line.match(/^(\s*)([-*])(\s+)(.*)$/);
  if (bulletMatch) {
    return {
      type: 'bullet',
      indent: bulletMatch[1],
      markerToken: bulletMatch[2],
      prefix: `${bulletMatch[1]}${bulletMatch[2]}${bulletMatch[3]}`,
      content: bulletMatch[4],
    };
  }

  const orderedMatch = line.match(/^(\s*)(\d+\.)(\s+)(.*)$/);
  if (orderedMatch) {
    return {
      type: 'ordered',
      indent: orderedMatch[1],
      markerToken: orderedMatch[2],
      prefix: `${orderedMatch[1]}${orderedMatch[2]}${orderedMatch[3]}`,
      content: orderedMatch[4],
    };
  }

  return null;
}

function buildTaskPrefix(indent: string, markerToken: string): string {
  return `${indent}${markerToken} [ ] `;
}

function buildSimpleListPrefix(indent: string, markerToken: string): string {
  return `${indent}${markerToken} `;
}

function incrementOrderedMarker(markerToken: string): string {
  const numericValue = Number.parseInt(markerToken, 10);
  if (!Number.isFinite(numericValue)) {
    return markerToken;
  }
  return `${numericValue + 1}.`;
}

export function wrapSelectionWithToken(
  value: string,
  start: number,
  end: number,
  token: string
): CommandResult {
  const range = normalizeRange(start, end);
  const selectedText = value.slice(range.start, range.end);
  const replacement = `${token}${selectedText}${token}`;
  const nextValue = replaceRange(value, range, replacement);

  if (selectedText.length === 0) {
    const caret = range.start + token.length;
    return {
      value: nextValue,
      selection: { start: caret, end: caret },
    };
  }

  return {
    value: nextValue,
    selection: {
      start: range.start + token.length,
      end: range.start + token.length + selectedText.length,
    },
  };
}

export function toggleLinePrefix(
  value: string,
  start: number,
  end: number,
  prefix: string
): CommandResult {
  const range = normalizeRange(start, end);
  const lineStart = value.lastIndexOf('\n', Math.max(0, range.start - 1)) + 1;
  const lastSelectedIndex = Math.max(range.end - 1, range.start);
  const lineEndBreak = value.indexOf('\n', lastSelectedIndex);
  const lineEnd = lineEndBreak === -1 ? value.length : lineEndBreak;
  const segment = value.slice(lineStart, lineEnd);
  const lines = segment.split('\n');
  const allPrefixed = lines.every((line) => line.startsWith(prefix));
  const updatedLines = lines.map((line) =>
    allPrefixed ? line.slice(prefix.length) : `${prefix}${line}`
  );
  const replacement = updatedLines.join('\n');
  const nextValue = replaceRange(
    value,
    { start: lineStart, end: lineEnd },
    replacement
  );

  return {
    value: nextValue,
    selection: {
      start: lineStart,
      end: lineStart + replacement.length,
    },
  };
}

export function toggleTaskMarkerAtLine(
  value: string,
  lineStart: number,
  lineEnd: number,
  checked: boolean
): string {
  const currentLine = value.slice(lineStart, lineEnd);
  const nextLine = currentLine.replace(/\[( |x|X)\]/, checked ? '[ ]' : '[x]');
  return replaceRange(value, { start: lineStart, end: lineEnd }, nextLine);
}

export function handleEnterInList(
  value: string,
  start: number,
  end: number
): CommandResult | null {
  const range = normalizeRange(start, end);
  if (range.start !== range.end) {
    return null;
  }

  const lineRange = getLineRange(value, range.start);
  const line = value.slice(lineRange.start, lineRange.end);
  const lineMatch = parseListLine(line);
  if (!lineMatch) {
    return null;
  }

  const caretOffset = range.start - lineRange.start;
  const contentStart = lineMatch.prefix.length;
  const safeCaretOffset = Math.max(contentStart, caretOffset);
  const beforeContent = line.slice(contentStart, safeCaretOffset);
  const afterContent = line.slice(safeCaretOffset);
  const contentIsEmpty =
    lineMatch.content.trim().length === 0 &&
    beforeContent.trim().length === 0 &&
    afterContent.trim().length === 0;

  if (contentIsEmpty) {
    const nextValue = replaceRange(value, lineRange, '');
    return {
      value: nextValue,
      selection: { start: lineRange.start, end: lineRange.start },
    };
  }

  const nextMarkerToken =
    lineMatch.type === 'ordered'
      ? incrementOrderedMarker(lineMatch.markerToken)
      : lineMatch.type === 'task' && /^\d+\.$/.test(lineMatch.markerToken)
        ? incrementOrderedMarker(lineMatch.markerToken)
        : lineMatch.markerToken;

  const nextPrefix =
    lineMatch.type === 'task'
      ? buildTaskPrefix(lineMatch.indent, nextMarkerToken)
      : buildSimpleListPrefix(lineMatch.indent, nextMarkerToken);
  const currentLine = `${lineMatch.prefix}${beforeContent}`;
  const nextLine = `${nextPrefix}${afterContent}`;
  const replacement = `${currentLine}\n${nextLine}`;
  const nextValue = replaceRange(value, lineRange, replacement);
  const nextCaret = lineRange.start + currentLine.length + 1 + nextPrefix.length;

  return {
    value: nextValue,
    selection: { start: nextCaret, end: nextCaret },
  };
}

export function handleBackspaceInList(
  value: string,
  start: number,
  end: number
): CommandResult | null {
  const range = normalizeRange(start, end);
  if (range.start !== range.end) {
    return null;
  }

  const lineRange = getLineRange(value, range.start);
  const line = value.slice(lineRange.start, lineRange.end);
  const lineMatch = parseListLine(line);
  if (!lineMatch) {
    return null;
  }

  const contentStart = lineRange.start + lineMatch.prefix.length;
  if (range.start !== contentStart) {
    return null;
  }

  if (lineMatch.indent.length >= 2) {
    const nextLine = `${lineMatch.indent.slice(2)}${line.slice(lineMatch.indent.length)}`;
    const nextValue = replaceRange(value, lineRange, nextLine);
    return {
      value: nextValue,
      selection: { start: range.start - 2, end: range.start - 2 },
    };
  }

  const nextValue = replaceRange(value, lineRange, lineMatch.content);
  return {
    value: nextValue,
    selection: { start: lineRange.start, end: lineRange.start },
  };
}

export function indentListLine(
  value: string,
  start: number,
  end: number
): CommandResult | null {
  const range = normalizeRange(start, end);
  const lineRange = getLineRange(value, range.start);
  const line = value.slice(lineRange.start, lineRange.end);
  const lineMatch = parseListLine(line);
  if (!lineMatch) {
    return null;
  }

  const nextLine = `  ${line}`;
  const nextValue = replaceRange(value, lineRange, nextLine);
  const shift = 2;
  return {
    value: nextValue,
    selection: { start: range.start + shift, end: range.end + shift },
  };
}

export function outdentListLine(
  value: string,
  start: number,
  end: number
): CommandResult | null {
  const range = normalizeRange(start, end);
  const lineRange = getLineRange(value, range.start);
  const line = value.slice(lineRange.start, lineRange.end);
  const lineMatch = parseListLine(line);
  if (!lineMatch || lineMatch.indent.length < 2) {
    return null;
  }

  const nextLine = `${lineMatch.indent.slice(2)}${line.slice(lineMatch.indent.length)}`;
  const nextValue = replaceRange(value, lineRange, nextLine);
  const shift = 2;
  return {
    value: nextValue,
    selection: {
      start: Math.max(lineRange.start, range.start - shift),
      end: Math.max(lineRange.start, range.end - shift),
    },
  };
}
