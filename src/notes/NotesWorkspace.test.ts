// @vitest-environment jsdom

import { describe, expect, it, vi } from 'vitest';

import type { NotesStore } from './NotesStore.ts';
import { NotesWorkspace } from './NotesWorkspace.ts';
import type { Note, NotesState } from './types.ts';

function note(): Note {
  return {
    id: '2db3cd30-5d10-4f74-8fe2-6680fa8605a2',
    title: 'Toolbar test',
    body: 'Text',
    status: 'active',
    is_pinned: false,
    meta: {},
    created_at: '2026-09-03T08:00:00Z',
    updated_at: '2026-09-03T09:00:00Z',
  };
}

function createStore(updateDraft: ReturnType<typeof vi.fn>): NotesStore {
  const currentNote = note();
  const state: NotesState = {
    activeNotes: [currentNote],
    archivedNotes: [],
    summary: {
      total: 1,
      active: 1,
      archived: 0,
      pinned: 0,
      pinned_active: 0,
    },
    currentNote,
    draftTitle: currentNote.title,
    draftBody: currentNote.body,
    listMode: 'active',
    search: '',
    loading: false,
    creating: false,
    actionPending: false,
    saveState: 'idle',
    loadError: null,
    mutationError: null,
  };

  return {
    snapshot: state,
    subscribe: vi.fn((listener: (value: Readonly<NotesState>) => void) => {
      listener(state);
      return () => undefined;
    }),
    initialize: vi.fn(async () => undefined),
    visibleNotes: vi.fn(() => state.activeNotes),
    updateDraft,
    setSearch: vi.fn(),
    setListMode: vi.fn(),
    selectNote: vi.fn(async () => true),
    createNote: vi.fn(async () => null),
    togglePin: vi.fn(async () => undefined),
    toggleArchive: vi.fn(async () => undefined),
    deleteCurrentNote: vi.fn(async () => false),
    clearMutationError: vi.fn(),
    reload: vi.fn(async () => undefined),
    flush: vi.fn(async () => true),
  } as unknown as NotesStore;
}

describe('NotesWorkspace Markdown toolbar', () => {
  it('renders the redesigned workspace around the existing note state', () => {
    const root = document.createElement('div');
    document.body.appendChild(root);
    const workspace = new NotesWorkspace(root, createStore(vi.fn()), {
      user: {
        id: 'user-1',
        email: 'user@example.test',
        username: 'user',
      },
      onLogout: vi.fn(async () => undefined),
      onSwitchAccount: vi.fn(),
    });

    workspace.mount();

    expect(root.querySelector('.sidebar-brand')).not.toBeNull();
    expect(root.querySelector('.note-stage')).not.toBeNull();
    expect(root.querySelector('.topbar')).toBeNull();
    expect(root.querySelector('.sidebar-create')?.textContent).toContain(
      'Нова нотатка',
    );
    expect(root.querySelector('[data-note-status-label]')?.textContent).toBe(
      'Активна нотатка',
    );
    expect(root.querySelector('.note-row__marker')).not.toBeNull();
    expect(root.querySelector('.note-row__date')).not.toBeNull();

    workspace.destroy();
    root.remove();
  });

  it('applies a command without losing the editor selection', () => {
    const updateDraft = vi.fn();
    const root = document.createElement('div');
    document.body.appendChild(root);
    const workspace = new NotesWorkspace(root, createStore(updateDraft), {
      user: {
        id: 'user-1',
        email: 'user@example.test',
        username: 'user',
      },
      onLogout: vi.fn(async () => undefined),
      onSwitchAccount: vi.fn(),
    });
    workspace.mount();
    const input = root.querySelector<HTMLTextAreaElement>(
      '[data-inkstone-role="input"]',
    );
    const boldButton = root.querySelector<HTMLButtonElement>(
      '[data-md-command="bold"]',
    );
    expect(input).not.toBeNull();
    expect(boldButton).not.toBeNull();

    input?.focus();
    input?.setSelectionRange(0, 4);
    boldButton?.dispatchEvent(
      new MouseEvent('pointerdown', { bubbles: true, cancelable: true }),
    );
    boldButton?.click();

    expect(input?.value).toBe('**Text**');
    expect(updateDraft).toHaveBeenLastCalledWith({ body: '**Text**' });

    workspace.destroy();
    root.remove();
  });
});
