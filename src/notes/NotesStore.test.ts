import { describe, expect, it, vi } from 'vitest';

import type { DraftRepository, StoredDraft } from './DraftStorage.ts';
import type { NoteListOptions, NotesApiClient } from './NotesApiClient.ts';
import { NotesStore } from './NotesStore.ts';
import type { Note, NoteSummary, PaginatedResponse } from './types.ts';

const SUMMARY: NoteSummary = {
  total: 2,
  active: 1,
  archived: 1,
  pinned: 0,
  pinned_active: 0,
};

function note(overrides: Partial<Note> = {}): Note {
  return {
    id: '2db3cd30-5d10-4f74-8fe2-6680fa8605a2',
    title: 'Перша нотатка',
    body: 'Текст',
    status: 'active',
    is_pinned: false,
    meta: {},
    created_at: '2026-09-03T08:00:00Z',
    updated_at: '2026-09-03T09:00:00Z',
    ...overrides,
  };
}

function page(results: Note[]): PaginatedResponse<Note> {
  return { count: results.length, next: null, previous: null, results };
}

function createApi(overrides: Partial<NotesApiClient> = {}): NotesApiClient {
  return {
    list: vi.fn(async ({ status }: NoteListOptions) =>
      page(
        status === 'archived'
          ? [note({ id: '9d5a037b-6212-4743-a899-15f415620f32', status })]
          : [note()],
      ),
    ),
    summary: vi.fn(async () => SUMMARY),
    create: vi.fn(async () => note()),
    patch: vi.fn(async (_id: string, payload: Partial<Note>) => note(payload)),
    delete: vi.fn(async () => undefined),
    pin: vi.fn(async () => note({ is_pinned: true })),
    unpin: vi.fn(async () => note({ is_pinned: false })),
    archive: vi.fn(async () => note({ status: 'archived' })),
    unarchive: vi.fn(async () => note({ status: 'active' })),
    ...overrides,
  } as unknown as NotesApiClient;
}

class MemoryDraftStorage implements DraftRepository {
  private readonly drafts = new Map<string, StoredDraft>();

  public load(noteId: string): StoredDraft | null {
    return this.drafts.get(noteId) ?? null;
  }

  public save(draft: StoredDraft): void {
    this.drafts.set(draft.noteId, { ...draft });
  }

  public remove(noteId: string): void {
    this.drafts.delete(noteId);
  }
}

describe('NotesStore', () => {
  it('loads active and archived notes and selects the first active note', async () => {
    const store = new NotesStore(createApi());

    await store.initialize();

    expect(store.snapshot.activeNotes).toHaveLength(1);
    expect(store.snapshot.archivedNotes).toHaveLength(1);
    expect(store.snapshot.currentNote?.title).toBe('Перша нотатка');
    expect(store.snapshot.summary).toEqual(SUMMARY);
  });

  it('loads every notes page instead of hiding notes after the first 100', async () => {
    const second = note({
      id: '65839c4f-f27f-48f8-90df-795cfe1fb0ae',
      title: 'Друга нотатка',
    });
    const list = vi.fn(async ({ status, page: pageNumber }: NoteListOptions) => {
      if (status === 'archived') return page([]);
      if (pageNumber === 1) {
        return {
          count: 2,
          next: 'https://api.example.test/notes/?page=2',
          previous: null,
          results: [note()],
        };
      }
      return {
        count: 2,
        next: null,
        previous: 'https://api.example.test/notes/?page=1',
        results: [second],
      };
    });
    const store = new NotesStore(
      createApi({ list } as Partial<NotesApiClient>),
    );

    await store.initialize();

    expect(store.snapshot.activeNotes).toHaveLength(2);
    expect(list).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'active', page: 2 }),
    );
  });

  it('serializes saves and preserves an edit made during an in-flight save', async () => {
    let resolveFirst!: (value: Note) => void;
    const firstSave = new Promise<Note>((resolve) => {
      resolveFirst = resolve;
    });
    const patch = vi
      .fn()
      .mockReturnValueOnce(firstSave)
      .mockImplementation(async (_id: string, payload: Partial<Note>) =>
        note(payload),
      );
    const store = new NotesStore(createApi({ patch } as Partial<NotesApiClient>));
    await store.initialize();

    store.updateDraft({ body: 'Версія 1' });
    const save = store.flush();
    store.updateDraft({ body: 'Версія 2' });
    resolveFirst(note({ body: 'Версія 1' }));

    await expect(save).resolves.toBe(true);
    expect(patch).toHaveBeenCalledTimes(2);
    expect(patch.mock.calls[1][1]).toMatchObject({ body: 'Версія 2' });
    expect(store.snapshot.currentNote?.body).toBe('Версія 2');
    expect(store.snapshot.saveState).toBe('saved');
  });

  it('preserves leading, trailing, and Markdown-significant whitespace', async () => {
    const patch = vi.fn(async (_id: string, payload: Partial<Note>) =>
      note(payload),
    );
    const store = new NotesStore(createApi({ patch } as Partial<NotesApiClient>));
    await store.initialize();
    const body = '\n  # Heading\n\nTrailing spaces stay.  \n';

    store.updateDraft({ body });
    await store.flush();

    expect(patch).toHaveBeenCalledWith(
      '2db3cd30-5d10-4f74-8fe2-6680fa8605a2',
      expect.objectContaining({ body }),
    );
    expect(store.snapshot.currentNote?.body).toBe(body);
  });

  it('restores and clears a recoverable local draft after saving it', async () => {
    const draftStorage = new MemoryDraftStorage();
    draftStorage.save({
      noteId: '2db3cd30-5d10-4f74-8fe2-6680fa8605a2',
      title: 'Локальна назва',
      body: 'Незбережений Markdown',
      baseUpdatedAt: '2026-09-03T09:00:00Z',
      editedAt: '2026-09-03T09:01:00Z',
    });
    const patch = vi.fn(async (_id: string, payload: Partial<Note>) =>
      note(payload),
    );
    const store = new NotesStore(
      createApi({ patch } as Partial<NotesApiClient>),
      draftStorage,
    );

    await store.initialize();

    expect(store.snapshot.draftTitle).toBe('Локальна назва');
    expect(store.snapshot.draftBody).toBe('Незбережений Markdown');
    expect(store.snapshot.saveState).toBe('queued');

    await store.flush();

    expect(patch).toHaveBeenCalledWith(
      '2db3cd30-5d10-4f74-8fe2-6680fa8605a2',
      expect.objectContaining({
        title: 'Локальна назва',
        body: 'Незбережений Markdown',
      }),
    );
    expect(draftStorage.load('2db3cd30-5d10-4f74-8fe2-6680fa8605a2')).toBeNull();
  });

  it('moves an archived note out of the active list', async () => {
    const api = createApi();
    const store = new NotesStore(api);
    await store.initialize();

    await store.toggleArchive();

    expect(api.archive).toHaveBeenCalledWith(
      '2db3cd30-5d10-4f74-8fe2-6680fa8605a2',
    );
    expect(store.snapshot.activeNotes).toHaveLength(0);
    expect(store.snapshot.archivedNotes).toHaveLength(2);
    expect(store.snapshot.currentNote?.status).toBe('archived');
  });
});
