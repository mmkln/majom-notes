export type InkstoneCommand =
  | { type: 'bold' }
  | { type: 'italic' }
  | { type: 'inline-code' }
  | { type: 'heading'; level: 1 | 2 | 3 }
  | { type: 'bullet-list' }
  | { type: 'ordered-list' }
  | { type: 'task-list' }
  | { type: 'blockquote' }
  | { type: 'code-block'; language?: string }
  | { type: 'link'; href?: string };
