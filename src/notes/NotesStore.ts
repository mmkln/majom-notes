import type { NotesApiClient } from './NotesApiClient.ts';
import { DraftStorage, type DraftRepository, type StoredDraft } from './DraftStorage.ts';
import type {
  Note,
  NoteListMode,
  NoteSummary,
  NotesState,
} from './types.ts';

const EMPTY_SUMMARY: NoteSummary = {
  total: 0,
  active: 0,
  archived: 0,
  pinned: 0,
  pinned_active: 0,
};

type Listener = (state: Readonly<NotesState>) => void;

function noteTime(note: Note): number {
  const time = new Date(note.updated_at).getTime();
  return Number.isFinite(time) ? time : 0;
}

function sortNotes(notes: Note[]): Note[] {
  return [...notes].sort((left, right) => {
    if (left.is_pinned !== right.is_pinned) return left.is_pinned ? -1 : 1;
    return noteTime(right) - noteTime(left);
  });
}

export class NotesStore {
  private state: NotesState = {
    activeNotes: [],
    archivedNotes: [],
    summary: EMPTY_SUMMARY,
    currentNote: null,
    draftTitle: '',
    draftBody: '',
    listMode: 'active',
    search: '',
    loading: false,
    creating: false,
    actionPending: false,
    saveState: 'idle',
    loadError: null,
    mutationError: null,
  };
  private readonly listeners = new Set<Listener>();
  private searchTimer: ReturnType<typeof setTimeout> | null = null;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private savePromise: Promise<boolean> | null = null;
  private loadVersion = 0;
  private editVersion = 0;
  private savedVersion = 0;

  constructor(
    private readonly api: NotesApiClient,
    private readonly draftStorage: DraftRepository = new DraftStorage(),
  ) {}

  public get snapshot(): Readonly<NotesState> {
    return this.state;
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.state);
    return () => this.listeners.delete(listener);
  }

  public visibleNotes(): Note[] {
    return this.state.listMode === 'active'
      ? this.state.activeNotes
      : this.state.archivedNotes;
  }

  public async initialize(): Promise<void> {
    await this.reload();
  }

  public async reload(): Promise<void> {
    const version = ++this.loadVersion;
    this.patch({ loading: true, loadError: null });
    try {
      const search = this.state.search;
      const [active, archived, summary] = await Promise.all([
        this.loadAllNotes('active', search),
        this.loadAllNotes('archived', search),
        this.api.summary(),
      ]);
      if (version !== this.loadVersion) return;

      const activeNotes = sortNotes(active);
      const archivedNotes = sortNotes(archived);
      let currentNote = this.state.currentNote;
      if (!currentNote) {
        currentNote = activeNotes[0] ?? archivedNotes[0] ?? null;
      } else if (this.editVersion === this.savedVersion) {
        currentNote =
          [...activeNotes, ...archivedNotes].find(
            (note) => note.id === currentNote?.id,
          ) ?? currentNote;
      }

      const shouldLoadDraft =
        currentNote?.id !== this.state.currentNote?.id ||
        this.editVersion === this.savedVersion;
      const recoveredDraft =
        shouldLoadDraft && currentNote
          ? this.getRecoverableDraft(currentNote)
          : null;
      this.state = {
        ...this.state,
        activeNotes,
        archivedNotes,
        summary,
        currentNote,
        draftTitle: recoveredDraft
          ? recoveredDraft.title
          : shouldLoadDraft
            ? currentNote?.title ?? ''
            : this.state.draftTitle,
        draftBody: recoveredDraft
          ? recoveredDraft.body
          : shouldLoadDraft
            ? currentNote?.body ?? ''
            : this.state.draftBody,
        saveState: recoveredDraft ? 'queued' : this.state.saveState,
        loading: false,
      };
      if (shouldLoadDraft) {
        this.resetDraftVersion(recoveredDraft !== null);
      }
      this.emit();
      if (recoveredDraft) this.scheduleSave();
    } catch (error) {
      if (version !== this.loadVersion) return;
      console.error('Failed to load notes.', error);
      this.patch({
        loading: false,
        loadError: 'Не вдалося завантажити нотатки.',
      });
    }
  }

  public setListMode(mode: NoteListMode): void {
    if (mode === this.state.listMode) return;
    this.patch({ listMode: mode });
  }

  public setSearch(search: string): void {
    this.patch({ search });
    if (this.searchTimer) clearTimeout(this.searchTimer);
    this.searchTimer = setTimeout(() => {
      this.searchTimer = null;
      void this.reload();
    }, 280);
  }

  public async selectNote(noteId: string): Promise<boolean> {
    if (this.state.currentNote?.id === noteId) return true;
    if (!(await this.flush())) return false;
    const note = [...this.state.activeNotes, ...this.state.archivedNotes].find(
      (item) => item.id === noteId,
    );
    if (!note) return false;
    this.setCurrentNote(note);
    return true;
  }

  public async createNote(): Promise<Note | null> {
    if (this.state.creating || !(await this.flush())) return null;
    this.patch({ creating: true, mutationError: null });
    try {
      const note = await this.api.create({
        title: 'Нотатка без назви',
        body: '',
        status: 'active',
        is_pinned: false,
        meta: {},
      });
      this.state = {
        ...this.state,
        activeNotes: sortNotes([...this.state.activeNotes, note]),
        summary: {
          ...this.state.summary,
          total: this.state.summary.total + 1,
          active: this.state.summary.active + 1,
        },
        creating: false,
      };
      this.setCurrentNote(note);
      return note;
    } catch (error) {
      console.error('Failed to create note.', error);
      this.patch({
        creating: false,
        mutationError: 'Не вдалося створити нотатку.',
      });
      return null;
    }
  }

  public updateDraft(patch: { title?: string; body?: string }): void {
    const note = this.state.currentNote;
    if (!note) return;
    const draftTitle = patch.title ?? this.state.draftTitle;
    const draftBody = patch.body ?? this.state.draftBody;
    this.editVersion += 1;
    this.patch({
      draftTitle,
      draftBody,
      saveState: 'queued',
      mutationError: null,
    });
    this.draftStorage.save({
      noteId: note.id,
      title: draftTitle,
      body: draftBody,
      baseUpdatedAt: note.updated_at,
      editedAt: new Date().toISOString(),
    });
    this.scheduleSave();
  }

  public async flush(): Promise<boolean> {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
    }
    if (!this.state.currentNote || this.savedVersion === this.editVersion) {
      return true;
    }
    if (this.savePromise) return this.savePromise;

    const promise = this.runSaveLoop().finally(() => {
      if (this.savePromise === promise) this.savePromise = null;
    });
    this.savePromise = promise;
    return promise;
  }

  public async togglePin(): Promise<void> {
    const note = this.state.currentNote;
    if (!note || this.state.actionPending || !(await this.flush())) return;
    await this.runAction(
      () => (note.is_pinned ? this.api.unpin(note.id) : this.api.pin(note.id)),
      'Не вдалося змінити закріплення нотатки.',
    );
  }

  public async toggleArchive(): Promise<void> {
    const note = this.state.currentNote;
    if (!note || this.state.actionPending || !(await this.flush())) return;
    await this.runAction(
      () =>
        note.status === 'archived'
          ? this.api.unarchive(note.id)
          : this.api.archive(note.id),
      'Не вдалося змінити статус нотатки.',
    );
  }

  public async deleteCurrentNote(): Promise<boolean> {
    const note = this.state.currentNote;
    if (!note || this.state.actionPending) return false;
    this.patch({ actionPending: true, mutationError: null });
    try {
      await this.api.delete(note.id);
      const activeNotes = this.state.activeNotes.filter(
        (item) => item.id !== note.id,
      );
      const archivedNotes = this.state.archivedNotes.filter(
        (item) => item.id !== note.id,
      );
      this.state = {
        ...this.state,
        activeNotes,
        archivedNotes,
        summary: {
          total: Math.max(0, this.state.summary.total - 1),
          active: Math.max(
            0,
            this.state.summary.active - (note.status === 'active' ? 1 : 0),
          ),
          archived: Math.max(
            0,
            this.state.summary.archived - (note.status === 'archived' ? 1 : 0),
          ),
          pinned: Math.max(
            0,
            this.state.summary.pinned - (note.is_pinned ? 1 : 0),
          ),
          pinned_active: Math.max(
            0,
            this.state.summary.pinned_active -
              (note.is_pinned && note.status === 'active' ? 1 : 0),
          ),
        },
        actionPending: false,
      };
      this.draftStorage.remove(note.id);
      const fallback =
        (this.state.listMode === 'active' ? activeNotes[0] : archivedNotes[0]) ??
        activeNotes[0] ??
        archivedNotes[0] ??
        null;
      this.setCurrentNote(fallback);
      return true;
    } catch (error) {
      console.error('Failed to delete note.', error);
      this.patch({
        actionPending: false,
        mutationError: 'Не вдалося видалити нотатку.',
      });
      return false;
    }
  }

  public clearMutationError(): void {
    if (this.state.mutationError) this.patch({ mutationError: null });
  }

  public destroy(): void {
    if (this.searchTimer) clearTimeout(this.searchTimer);
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.listeners.clear();
  }

  private async runSaveLoop(): Promise<boolean> {
    while (this.state.currentNote && this.savedVersion < this.editVersion) {
      const noteId = this.state.currentNote.id;
      const targetVersion = this.editVersion;
      const body = this.state.draftBody;
      const title = this.state.draftTitle.trim() ||
        (body.trim() ? '' : 'Нотатка без назви');
      this.patch({ saveState: 'saving', mutationError: null });
      try {
        const updated = await this.api.patch(noteId, { title, body });
        if (this.state.currentNote?.id !== noteId) return true;
        this.savedVersion = targetVersion;
        this.replaceNote(updated);
        if (this.savedVersion === this.editVersion) {
          this.draftStorage.remove(noteId);
        } else {
          this.draftStorage.save({
            noteId,
            title: this.state.draftTitle,
            body: this.state.draftBody,
            baseUpdatedAt: updated.updated_at,
            editedAt: new Date().toISOString(),
          });
        }
      } catch (error) {
        console.error('Failed to save note.', error);
        this.patch({
          saveState: 'error',
          mutationError: 'Не вдалося зберегти зміни.',
        });
        return false;
      }
    }
    this.patch({ saveState: 'saved' });
    return true;
  }

  private async runAction(
    request: () => Promise<Note>,
    errorMessage: string,
  ): Promise<void> {
    this.patch({ actionPending: true, mutationError: null });
    try {
      const updated = await request();
      this.replaceNote(updated);
      this.patch({ actionPending: false });
      void this.reloadSummary();
    } catch (error) {
      console.error('Failed to update note.', error);
      this.patch({ actionPending: false, mutationError: errorMessage });
    }
  }

  private replaceNote(note: Note): void {
    const activeNotes = this.state.activeNotes.filter(
      (item) => item.id !== note.id,
    );
    const archivedNotes = this.state.archivedNotes.filter(
      (item) => item.id !== note.id,
    );
    if (note.status === 'active') activeNotes.push(note);
    else archivedNotes.push(note);

    this.state = {
      ...this.state,
      activeNotes: sortNotes(activeNotes),
      archivedNotes: sortNotes(archivedNotes),
      currentNote:
        this.state.currentNote?.id === note.id
          ? note
          : this.state.currentNote,
    };
    this.emit();
  }

  private setCurrentNote(note: Note | null): void {
    const recoveredDraft = note ? this.getRecoverableDraft(note) : null;
    this.state = {
      ...this.state,
      currentNote: note,
      draftTitle: recoveredDraft?.title ?? note?.title ?? '',
      draftBody: recoveredDraft?.body ?? note?.body ?? '',
      saveState: recoveredDraft ? 'queued' : 'idle',
      mutationError: null,
    };
    this.resetDraftVersion(recoveredDraft !== null);
    this.emit();
    if (recoveredDraft) this.scheduleSave();
  }

  private resetDraftVersion(hasUnsavedDraft = false): void {
    this.editVersion = hasUnsavedDraft ? 1 : 0;
    this.savedVersion = 0;
  }

  private getRecoverableDraft(note: Note): StoredDraft | null {
    const draft = this.draftStorage.load(note.id);
    if (!draft || draft.baseUpdatedAt !== note.updated_at) return null;
    if (draft.title === note.title && draft.body === note.body) {
      this.draftStorage.remove(note.id);
      return null;
    }
    return draft;
  }

  private scheduleSave(delay = 450): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.flush();
    }, delay);
  }

  private async reloadSummary(): Promise<void> {
    try {
      const summary = await this.api.summary();
      this.patch({ summary });
    } catch (error) {
      console.error('Failed to refresh note summary.', error);
    }
  }

  private async loadAllNotes(
    status: 'active' | 'archived',
    search: string,
  ): Promise<Note[]> {
    const notes: Note[] = [];
    let page = 1;

    while (true) {
      const response = await this.api.list({
        status,
        search,
        page,
        pageSize: 100,
      });
      notes.push(...response.results);
      if (!response.next || notes.length >= response.count) return notes;
      page += 1;
    }
  }

  private patch(patch: Partial<NotesState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.state));
  }
}
