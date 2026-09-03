export type NoteStatus = 'active' | 'archived';

export type Note = {
  readonly id: string;
  title: string;
  body: string;
  status: NoteStatus;
  is_pinned: boolean;
  meta: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type NoteSummary = {
  total: number;
  active: number;
  archived: number;
  pinned: number;
  pinned_active: number;
};

export type PaginatedResponse<T> = {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
};

export type NoteCreatePayload = Partial<
  Pick<Note, 'title' | 'body' | 'status' | 'is_pinned' | 'meta'>
>;

export type NotePatchPayload = Partial<
  Pick<Note, 'title' | 'body' | 'status' | 'is_pinned' | 'meta'>
>;

export type NoteListMode = 'active' | 'archived';
export type SaveState = 'idle' | 'queued' | 'saving' | 'saved' | 'error';

export type NotesState = {
  activeNotes: Note[];
  archivedNotes: Note[];
  summary: NoteSummary;
  currentNote: Note | null;
  draftTitle: string;
  draftBody: string;
  listMode: NoteListMode;
  search: string;
  loading: boolean;
  creating: boolean;
  actionPending: boolean;
  saveState: SaveState;
  loadError: string | null;
  mutationError: string | null;
};
