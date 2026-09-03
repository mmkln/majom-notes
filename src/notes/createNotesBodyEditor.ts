import {
  createInkstoneEditor,
  createInkstoneMarkdownEngine,
  createInkstoneMirrorRenderer,
  type InkstoneEditorHandle,
} from '@majom/inkstone';

const engine = createInkstoneMarkdownEngine({ normalizeLineEndings: true });
const renderer = createInkstoneMirrorRenderer({ profile: 'editor' });

export function createNotesBodyEditor(options: {
  value: string;
  onChange: (value: string) => void;
}): InkstoneEditorHandle {
  return createInkstoneEditor({
    value: options.value,
    placeholder: 'Занотуйте деталі, контекст або наступну думку…',
    hostClassName: 'notes-body-editor-host',
    inputClassName: 'notes-body-editor-input',
    enableMarkdownShortcuts: true,
    engine,
    mirrorRenderer: renderer,
    onChange: options.onChange,
  });
}
