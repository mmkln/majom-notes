import {
  createInkstoneMarkdownEngine,
  type InkstoneMarkdownDocument,
  type InkstoneMarkdownEngine,
} from './InkstoneMarkdownEngine.ts';
import {
  createInkstoneMirrorRenderer,
  type InkstoneMirrorRenderMode,
  type InkstoneMirrorRenderer,
} from './InkstoneMirrorRenderer.ts';
import {
  handleBackspaceInList,
  handleEnterInList,
  indentListLine,
  outdentListLine,
  toggleTaskMarkerAtLine,
  toggleLinePrefix,
  wrapSelectionWithToken,
} from './markdownCommands.ts';

export type InkstoneEditorOptions = {
  value: string;
  placeholder?: string;
  inputClassName?: string;
  hostClassName?: string;
  rows?: number;
  dataRole?: string;
  paddingBottom?: string;
  enableMarkdownShortcuts?: boolean;
  engine?: InkstoneMarkdownEngine;
  mirrorRenderer?: InkstoneMirrorRenderer;
  onChange?: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onDocumentChange?: (document: InkstoneMarkdownDocument) => void;
};

export type InkstoneEditorHandle = {
  readonly element: HTMLDivElement;
  mount: (host: HTMLElement) => void;
  destroy: () => void;
  focus: () => void;
  setValue: (value: string) => void;
  getValue: () => string;
  getInputElement: () => HTMLTextAreaElement;
  getDocument: () => InkstoneMarkdownDocument;
};

class InkstoneEditor implements InkstoneEditorHandle {
  public readonly element: HTMLDivElement;
  private readonly input: HTMLTextAreaElement;
  private readonly engine: InkstoneMarkdownEngine;
  private readonly surface: HTMLDivElement;
  private readonly mirror: HTMLDivElement;
  private readonly mirrorContent: HTMLDivElement;
  private readonly mirrorRenderer: InkstoneMirrorRenderer;
  private documentSnapshot: InkstoneMarkdownDocument;
  private activeBlockLineStart: number | null = null;

  constructor(private readonly options: InkstoneEditorOptions) {
    this.engine =
      options.engine ?? createInkstoneMarkdownEngine({ normalizeLineEndings: true });
    this.mirrorRenderer = options.mirrorRenderer ?? createInkstoneMirrorRenderer();
    this.element = document.createElement('div');
    this.element.className = options.hostClassName ?? 'flex min-h-0 flex-1';
    this.element.style.position = 'relative';

    this.surface = document.createElement('div');
    this.surface.className = 'flex min-h-0 flex-1';
    this.surface.style.position = 'relative';
    this.surface.style.flex = '1 1 auto';
    this.surface.style.minHeight = '0';

    this.mirror = document.createElement('div');
    this.mirror.dataset.inkstoneRole = 'mirror';
    this.mirror.style.position = 'absolute';
    this.mirror.style.inset = '0';
    this.mirror.style.overflow = 'hidden';
    this.mirror.style.pointerEvents = 'none';
    this.mirror.style.whiteSpace = 'pre-wrap';
    this.mirror.style.wordBreak = 'break-word';
    this.mirror.style.zIndex = '2';

    this.mirrorContent = document.createElement('div');
    this.mirrorContent.dataset.inkstoneRole = 'mirror-content';
    this.mirrorContent.className = options.inputClassName ?? '';
    this.mirrorContent.style.minHeight = '100%';
    this.mirrorContent.style.whiteSpace = 'pre-wrap';
    this.mirrorContent.style.wordBreak = 'break-word';
    this.mirror.appendChild(this.mirrorContent);

    this.input = document.createElement('textarea');
    this.documentSnapshot = this.engine.parse(options.value);
    this.input.value = this.documentSnapshot.normalized;
    this.input.placeholder = options.placeholder ?? '';
    this.input.className = options.inputClassName ?? '';
    this.input.rows = options.rows ?? 6;
    this.input.spellcheck = false;
    this.input.autocomplete = 'off';
    this.input.autocapitalize = 'off';
    this.input.setAttribute('autocorrect', 'off');
    this.input.style.border = 'none';
    if (options.paddingBottom) {
      this.input.style.paddingBottom = options.paddingBottom;
    }
    if (options.dataRole) {
      this.input.dataset.role = options.dataRole;
    }
    this.input.dataset.inkstoneRole = 'input';
    this.input.style.position = 'absolute';
    this.input.style.inset = '0';
    this.input.style.width = '100%';
    this.input.style.height = '100%';
    this.input.style.background = 'transparent';
    this.input.style.color = 'transparent';
    this.input.style.caretColor = '#0f172a';
    this.input.style.zIndex = '1';
    this.input.style.whiteSpace = 'pre-wrap';
    this.input.style.wordBreak = 'break-word';
    this.input.style.overflow = 'auto';
    this.input.style.resize = 'none';
    this.input.style.outline = 'none';

    this.input.addEventListener('input', () => {
      this.syncDocumentFromInput();
    });
    this.input.addEventListener('scroll', () => {
      this.syncMirrorScroll();
    });
    this.input.addEventListener('focus', () => {
      this.updateActiveBlockFromSelection();
      this.options.onFocus?.();
    });
    this.input.addEventListener('blur', () => {
      this.setActiveBlockLineStart(null);
      this.options.onBlur?.();
    });
    this.input.addEventListener('select', () => {
      this.updateActiveBlockFromSelection();
    });
    this.input.addEventListener('click', () => {
      this.updateActiveBlockFromSelection();
    });
    this.input.addEventListener('keyup', () => {
      this.updateActiveBlockFromSelection();
    });
    this.input.addEventListener('keydown', (event) => {
      this.handleKeydown(event);
    });
    this.mirror.addEventListener('mousedown', (event) => {
      this.handleMirrorMouseDown(event);
    });
    this.mirror.addEventListener('click', (event) => {
      this.handleMirrorClick(event);
    });

    this.surface.append(this.mirror, this.input);
    this.element.appendChild(this.surface);
    this.renderMirror();
    this.syncHostMetadata();
  }

  public mount(host: HTMLElement): void {
    host.replaceChildren(this.element);
  }

  public destroy(): void {
    this.element.remove();
  }

  public focus(): void {
    this.input.focus();
  }

  public setValue(value: string): void {
    const normalized = this.engine.normalize(value);
    if (this.input.value === normalized) {
      return;
    }

    const shouldRestoreSelection = document.activeElement === this.input;
    const selectionStart = this.input.selectionStart;
    const selectionEnd = this.input.selectionEnd;

    this.input.value = normalized;
    this.documentSnapshot = this.engine.parse(normalized);
    this.activeBlockLineStart = this.resolveActiveBlockLineStart();
    this.renderMirror();
    this.syncHostMetadata();
    this.options.onDocumentChange?.(this.documentSnapshot);

    if (shouldRestoreSelection && selectionStart !== null && selectionEnd !== null) {
      this.input.setSelectionRange(selectionStart, selectionEnd);
    }
  }

  public getValue(): string {
    return this.input.value;
  }

  public getInputElement(): HTMLTextAreaElement {
    return this.input;
  }

  public getDocument(): InkstoneMarkdownDocument {
    return this.documentSnapshot;
  }

  private handleKeydown(event: KeyboardEvent): void {
    if (this.options.enableMarkdownShortcuts === false) {
      return;
    }

    if (event.key === 'Enter') {
      this.applyOptionalCommand(event, handleEnterInList);
      return;
    }

    if (event.key === 'Backspace') {
      this.applyOptionalCommand(event, handleBackspaceInList);
      return;
    }

    if (event.key === 'Tab') {
      this.applyOptionalCommand(
        event,
        event.shiftKey ? outdentListLine : indentListLine
      );
      return;
    }

    const isPrimaryModifier = event.metaKey || event.ctrlKey;
    if (!isPrimaryModifier || event.altKey) {
      return;
    }

    const key = event.key.toLowerCase();
    if (key === 'b') {
      event.preventDefault();
      this.applyCommand((value, start, end) =>
        wrapSelectionWithToken(value, start, end, '**')
      );
      return;
    }

    if (key === 'i') {
      event.preventDefault();
      this.applyCommand((value, start, end) =>
        wrapSelectionWithToken(value, start, end, '_')
      );
      return;
    }

    if (event.shiftKey && key === '8') {
      event.preventDefault();
      this.applyCommand((value, start, end) =>
        toggleLinePrefix(value, start, end, '- ')
      );
      return;
    }
  }

  private applyCommand(
    command: (
      value: string,
      start: number,
      end: number
    ) => { value: string; selection: { start: number; end: number } }
  ): void {
    const start = this.input.selectionStart ?? 0;
    const end = this.input.selectionEnd ?? start;
    const result = command(this.input.value, start, end);

    this.input.value = result.value;
    this.input.setSelectionRange(result.selection.start, result.selection.end);
    this.syncDocumentFromInput();
  }

  private applyOptionalCommand(
    event: KeyboardEvent,
    command: (
      value: string,
      start: number,
      end: number
    ) => { value: string; selection: { start: number; end: number } } | null
  ): void {
    const start = this.input.selectionStart ?? 0;
    const end = this.input.selectionEnd ?? start;
    const result = command(this.input.value, start, end);
    if (!result) {
      return;
    }

    event.preventDefault();
    this.input.value = result.value;
    this.input.setSelectionRange(result.selection.start, result.selection.end);
    this.syncDocumentFromInput();
  }

  private syncDocumentFromInput(): void {
    this.documentSnapshot = this.engine.parse(this.input.value);
    if (this.input.value !== this.documentSnapshot.normalized) {
      const start = this.input.selectionStart ?? this.documentSnapshot.normalized.length;
      const end = this.input.selectionEnd ?? this.documentSnapshot.normalized.length;
      this.input.value = this.documentSnapshot.normalized;
      this.input.setSelectionRange(start, end);
    }
    this.activeBlockLineStart = this.resolveActiveBlockLineStart();
    this.renderMirror();
    this.syncHostMetadata();
    this.options.onChange?.(this.documentSnapshot.normalized);
    this.options.onDocumentChange?.(this.documentSnapshot);
  }

  private syncHostMetadata(): void {
    this.element.dataset.inkstoneBlockCount = String(
      this.documentSnapshot.blocks.length
    );
    this.element.dataset.inkstoneHeadingCount = String(
      this.documentSnapshot.stats.headings
    );
    this.element.dataset.inkstoneTaskCount = String(
      this.documentSnapshot.stats.taskItems
    );
  }

  private syncMirrorScroll(): void {
    this.mirror.scrollTop = this.input.scrollTop;
    this.mirror.scrollLeft = this.input.scrollLeft;
  }

  private captureInputScrollState(): { top: number; left: number } {
    return {
      top: this.input.scrollTop,
      left: this.input.scrollLeft,
    };
  }

  private restoreInputScrollState(scrollState: { top: number; left: number }): void {
    this.input.scrollTop = scrollState.top;
    this.input.scrollLeft = scrollState.left;
    this.syncMirrorScroll();
  }

  private findTaskToggleTarget(target: EventTarget | null): HTMLElement | null {
    if (!(target instanceof HTMLElement)) {
      return null;
    }

    return target.closest<HTMLElement>('[data-inkstone-task-toggle="true"]');
  }

  private handleMirrorMouseDown(event: MouseEvent): void {
    if (this.findTaskToggleTarget(event.target)) {
      event.preventDefault();
    }
  }

  private handleMirrorClick(event: MouseEvent): void {
    const taskToggle = this.findTaskToggleTarget(event.target);
    if (taskToggle) {
      event.preventDefault();
      const lineStart = Number(taskToggle.dataset.inkstoneLineStart);
      if (Number.isFinite(lineStart)) {
        this.toggleTaskAtLineStart(lineStart);
      }
      return;
    }

  }

  private toggleTaskAtLineStart(lineStart: number): void {
    const block = this.documentSnapshot.blocks.find(
      (candidate) =>
        candidate.type === 'task_list_item' && candidate.lineStart === lineStart
    );
    if (!block) {
      return;
    }

    const scrollState = this.captureInputScrollState();
    const nextValue = toggleTaskMarkerAtLine(
      this.input.value,
      block.lineStart,
      block.lineEnd,
      block.checked === true
    );
    this.input.value = nextValue;
    this.documentSnapshot = this.engine.parse(nextValue);
    this.activeBlockLineStart = this.resolveActiveBlockLineStart();
    if (!this.patchRenderedTaskLine(block.lineStart)) {
      this.renderMirror();
    }
    this.restoreInputScrollState(scrollState);
    this.syncHostMetadata();
    this.options.onChange?.(this.documentSnapshot.normalized);
    this.options.onDocumentChange?.(this.documentSnapshot);
  }

  private renderMirror(): void {
    this.mirrorRenderer.render(this.mirrorContent, this.documentSnapshot, {
      placeholder: this.options.placeholder,
      activeBlockLineStart: this.activeBlockLineStart,
    });
    this.syncMirrorScroll();
  }

  private patchRenderedTaskLine(lineStart: number): boolean {
    const block = this.documentSnapshot.blocks.find(
      (candidate) =>
        candidate.type === 'task_list_item' && candidate.lineStart === lineStart
    );
    if (!block) {
      return false;
    }

    const currentLine = this.mirrorContent.querySelector<HTMLDivElement>(
      `[data-inkstone-role="line"][data-inkstone-line-start="${lineStart}"]`
    );
    if (!currentLine) {
      return false;
    }

    // Task toggle should patch only the affected visual line instead of
    // rebuilding the entire mirror surface.
    const nextLine = this.mirrorRenderer.createLineElement(block, {
      renderMode: this.getRenderModeForBlock(block.lineStart),
    });
    currentLine.replaceWith(nextLine);
    return true;
  }

  private updateActiveBlockFromSelection(): void {
    this.setActiveBlockLineStart(this.resolveActiveBlockLineStart());
  }

  private setActiveBlockLineStart(lineStart: number | null): void {
    if (this.activeBlockLineStart === lineStart) {
      return;
    }

    const previousLineStart = this.activeBlockLineStart;
    this.activeBlockLineStart = lineStart;

    if (!this.mirrorContent.hasChildNodes()) {
      return;
    }

    const linesToPatch = [previousLineStart, lineStart].filter(
      (value, index, values): value is number =>
        value !== null && values.indexOf(value) === index
    );

    if (
      linesToPatch.length === 0 ||
      linesToPatch.some((value) => !this.patchRenderedLine(value))
    ) {
      this.renderMirror();
      return;
    }

    this.syncMirrorScroll();
  }

  private patchRenderedLine(lineStart: number): boolean {
    const block = this.documentSnapshot.blocks.find(
      (candidate) => candidate.lineStart === lineStart
    );
    if (!block) {
      return false;
    }

    const currentLine = this.mirrorContent.querySelector<HTMLDivElement>(
      `[data-inkstone-role="line"][data-inkstone-line-start="${lineStart}"]`
    );
    if (!currentLine) {
      return false;
    }

    const nextLine = this.mirrorRenderer.createLineElement(block, {
      renderMode: this.getRenderModeForBlock(lineStart),
    });
    currentLine.replaceWith(nextLine);
    return true;
  }

  private getRenderModeForBlock(lineStart: number): InkstoneMirrorRenderMode {
    return this.activeBlockLineStart === lineStart ? 'editing' : 'styled';
  }

  private resolveActiveBlockLineStart(): number | null {
    if (document.activeElement !== this.input) {
      return null;
    }

    const position = this.input.selectionStart ?? 0;
    const exactBlock = this.documentSnapshot.blocks.find(
      (block) => position >= block.lineStart && position <= block.lineEnd
    );
    if (exactBlock) {
      return exactBlock.lineStart;
    }

    const fallbackBlock = [...this.documentSnapshot.blocks]
      .reverse()
      .find((block) => position >= block.lineStart);

    return fallbackBlock?.lineStart ?? null;
  }
}

export function createInkstoneEditor(
  options: InkstoneEditorOptions
): InkstoneEditorHandle {
  return new InkstoneEditor(options);
}
