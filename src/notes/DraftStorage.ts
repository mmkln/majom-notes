export type StoredDraft = {
  noteId: string;
  title: string;
  body: string;
  baseUpdatedAt: string;
  editedAt: string;
};

export type DraftRepository = {
  load: (noteId: string) => StoredDraft | null;
  save: (draft: StoredDraft) => void;
  remove: (noteId: string) => void;
};

const STORAGE_PREFIX = 'majom-notes:draft:v1:';

function browserStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isStoredDraft(value: unknown, noteId: string): value is StoredDraft {
  if (!value || typeof value !== 'object') return false;
  const draft = value as Partial<StoredDraft>;
  return (
    draft.noteId === noteId &&
    typeof draft.title === 'string' &&
    typeof draft.body === 'string' &&
    typeof draft.baseUpdatedAt === 'string' &&
    typeof draft.editedAt === 'string'
  );
}

export class DraftStorage implements DraftRepository {
  constructor(private readonly storage: Storage | null = browserStorage()) {}

  public load(noteId: string): StoredDraft | null {
    if (!this.storage) return null;
    try {
      const raw = this.storage.getItem(`${STORAGE_PREFIX}${noteId}`);
      if (!raw) return null;
      const value: unknown = JSON.parse(raw);
      return isStoredDraft(value, noteId) ? value : null;
    } catch {
      return null;
    }
  }

  public save(draft: StoredDraft): void {
    if (!this.storage) return;
    try {
      this.storage.setItem(
        `${STORAGE_PREFIX}${draft.noteId}`,
        JSON.stringify(draft),
      );
    } catch {
      // The primary API autosave remains available when storage is unavailable.
    }
  }

  public remove(noteId: string): void {
    if (!this.storage) return;
    try {
      this.storage.removeItem(`${STORAGE_PREFIX}${noteId}`);
    } catch {
      // A stale recovery draft is harmless if browser storage becomes unavailable.
    }
  }
}
