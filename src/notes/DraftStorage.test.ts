// @vitest-environment jsdom

import { beforeEach, describe, expect, it } from 'vitest';

import { DraftStorage, type StoredDraft } from './DraftStorage.ts';

const DRAFT: StoredDraft = {
  noteId: 'note-1',
  title: 'Локальна назва',
  body: '\nMarkdown body  \n',
  baseUpdatedAt: '2026-09-03T09:00:00Z',
  editedAt: '2026-09-03T09:01:00Z',
};

describe('DraftStorage', () => {
  beforeEach(() => window.localStorage.clear());

  it('stores, restores, and removes a recovery draft', () => {
    const storage = new DraftStorage(window.localStorage);

    storage.save(DRAFT);
    expect(storage.load(DRAFT.noteId)).toEqual(DRAFT);

    storage.remove(DRAFT.noteId);
    expect(storage.load(DRAFT.noteId)).toBeNull();
  });

  it('ignores malformed draft data', () => {
    window.localStorage.setItem('majom-notes:draft:v1:note-1', '{bad json');
    const storage = new DraftStorage(window.localStorage);

    expect(storage.load('note-1')).toBeNull();
  });
});
