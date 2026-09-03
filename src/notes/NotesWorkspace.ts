import type { InkstoneCommand, InkstoneEditorHandle } from '@majom/inkstone';

import type { AuthUser } from '../auth/types.ts';
import { ConfirmDialog } from '../ui/ConfirmDialog.ts';
import { createIcon, setButtonIcon } from '../ui/icons.ts';
import {
  createNotesBodyEditor,
  createNotesSnippet,
} from './createNotesBodyEditor.ts';
import type { NotesStore } from './NotesStore.ts';
import type { Note, NotesState } from './types.ts';

type NotesWorkspaceOptions = {
  user: AuthUser;
  onLogout: () => Promise<void>;
  onSwitchAccount: () => void;
};

function noteTitle(note: Note | null, draftTitle?: string): string {
  return draftTitle?.trim() || note?.title.trim() || 'Нотатка без назви';
}

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('uk-UA', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export class NotesWorkspace {
  private readonly confirmDialog = new ConfirmDialog();
  private disposeStore: (() => void) | null = null;
  private bodyEditor: InkstoneEditorHandle | null = null;
  private renderedNoteId: string | null = null;
  private mobileView: 'list' | 'editor' = 'list';
  private accountMenuOpen = false;
  private toastTimer: ReturnType<typeof setTimeout> | null = null;
  private lastToastMessage: string | null = null;

  private shell!: HTMLElement;
  private listHost!: HTMLElement;
  private listStatus!: HTMLElement;
  private searchInput!: HTMLInputElement;
  private activeTab!: HTMLButtonElement;
  private archivedTab!: HTMLButtonElement;
  private activeCount!: HTMLElement;
  private archivedCount!: HTMLElement;
  private createButton!: HTMLButtonElement;
  private mobileCreateButton!: HTMLButtonElement;
  private mobileBackButton!: HTMLButtonElement;
  private editorContent!: HTMLElement;
  private editorEmpty!: HTMLElement;
  private titleInput!: HTMLInputElement;
  private markdownToolbar!: HTMLElement;
  private bodyHost!: HTMLElement;
  private updatedLabel!: HTMLElement;
  private saveLabel!: HTMLElement;
  private pinButton!: HTMLButtonElement;
  private archiveButton!: HTMLButtonElement;
  private deleteButton!: HTMLButtonElement;
  private retryButton!: HTMLButtonElement;
  private accountTrigger!: HTMLButtonElement;
  private accountPopover!: HTMLElement;
  private toast!: HTMLElement;

  constructor(
    private readonly root: HTMLElement,
    private readonly store: NotesStore,
    private readonly options: NotesWorkspaceOptions,
  ) {}

  public mount(): void {
    this.root.innerHTML = `
      <div class="notes-shell" data-mobile-view="list">
        <header class="topbar">
          <div class="brand" aria-label="Majom Notes">
            <span class="brand__mark" data-brand-icon></span>
            <span class="brand__name">Majom Notes</span>
          </div>
          <div class="account">
            <button class="account__trigger" type="button" aria-label="Меню акаунта" aria-haspopup="menu" aria-expanded="false">
              <span class="account__avatar"></span>
            </button>
            <div class="account__popover" role="menu" hidden>
              <div class="account__identity">
                <span class="account__avatar account__avatar--large"></span>
                <span><strong></strong><small>Majom ID</small></span>
              </div>
              <hr />
              <button type="button" role="menuitem" data-switch-account>Змінити акаунт</button>
              <button class="account__logout" type="button" role="menuitem" data-logout>Вийти</button>
            </div>
          </div>
        </header>

        <div class="workspace">
          <aside class="sidebar" aria-label="Список нотаток">
            <div class="sidebar__header">
              <div>
                <p class="eyebrow">Простір</p>
                <h1>Нотатки</h1>
              </div>
              <button class="icon-button icon-button--primary" type="button" data-create aria-label="Нова нотатка"></button>
            </div>

            <label class="search-field">
              <span data-search-icon></span>
              <input type="search" placeholder="Шукати нотатки…" autocomplete="off" />
            </label>

            <div class="note-tabs" role="tablist" aria-label="Статус нотаток">
              <button type="button" role="tab" data-tab="active">
                Активні <span data-active-count>0</span>
              </button>
              <button type="button" role="tab" data-tab="archived">
                Архів <span data-archived-count>0</span>
              </button>
            </div>

            <div class="list-status" aria-live="polite"></div>
            <div class="notes-list" role="list"></div>

            <div class="sidebar__footer">
              <button class="button button--primary button--block" type="button" data-mobile-create>
                <span data-mobile-create-icon></span>
                Нова нотатка
              </button>
            </div>
          </aside>

          <main class="editor-pane">
            <div class="editor-empty">
              <span class="editor-empty__icon" data-empty-icon></span>
              <h2>Оберіть нотатку</h2>
              <p>Виберіть нотатку зі списку або створіть нову.</p>
              <button class="button button--primary" type="button" data-empty-create>Нова нотатка</button>
            </div>

            <div class="editor-content" hidden>
              <header class="editor-toolbar">
                <div class="editor-toolbar__meta">
                  <button class="icon-button mobile-back" type="button" aria-label="Назад до списку"></button>
                  <div>
                    <span class="updated-label"></span>
                    <span class="save-label" aria-live="polite"></span>
                  </div>
                </div>
                <div class="editor-toolbar__actions">
                  <button class="icon-button pin-button" type="button"></button>
                  <button class="icon-button archive-button" type="button"></button>
                  <button class="icon-button icon-button--danger delete-button" type="button" aria-label="Видалити нотатку"></button>
                </div>
              </header>

              <div class="editor-scroll">
                <input class="title-input" type="text" placeholder="Назва нотатки" maxlength="200" />
                <div class="markdown-toolbar" data-markdown-toolbar role="toolbar" aria-label="Форматування Markdown">
                  <button type="button" data-md-command="heading" data-level="2" aria-label="Заголовок другого рівня" title="Заголовок другого рівня">H2</button>
                  <button type="button" data-md-command="bold" aria-label="Жирний текст" title="Жирний текст (Ctrl+B)"><strong>B</strong></button>
                  <button type="button" data-md-command="italic" aria-label="Курсив" title="Курсив (Ctrl+I)"><em>I</em></button>
                  <button type="button" data-md-command="inline-code" aria-label="Код у рядку" title="Код у рядку">&lt;/&gt;</button>
                  <span class="markdown-toolbar__separator" aria-hidden="true"></span>
                  <button type="button" data-md-command="bullet-list" aria-label="Маркований список" title="Маркований список">•</button>
                  <button type="button" data-md-command="ordered-list" aria-label="Нумерований список" title="Нумерований список">1.</button>
                  <button type="button" data-md-command="task-list" aria-label="Список завдань" title="Список завдань">☑</button>
                  <button type="button" data-md-command="blockquote" aria-label="Цитата" title="Цитата">❯</button>
                  <span class="markdown-toolbar__separator" aria-hidden="true"></span>
                  <button type="button" data-md-command="link" aria-label="Посилання" title="Посилання (Ctrl+K)">↗</button>
                  <button type="button" data-md-command="code-block" aria-label="Блок коду" title="Блок коду">{ }</button>
                </div>
                <div class="body-host"></div>
              </div>
            </div>
          </main>
        </div>

        <button class="retry-button" type="button" hidden>Повторити завантаження</button>
        <div class="toast" role="status" aria-live="polite" hidden></div>
      </div>
    `;

    this.captureElements();
    this.decorateStaticElements();
    this.bindEvents();
    this.disposeStore = this.store.subscribe((state) => this.render(state));
    void this.store.initialize();
  }

  public destroy(): void {
    this.disposeStore?.();
    this.disposeStore = null;
    this.bodyEditor?.destroy();
    this.bodyEditor = null;
    this.confirmDialog.destroy();
    if (this.toastTimer) clearTimeout(this.toastTimer);
    document.removeEventListener('click', this.handleDocumentClick);
    document.removeEventListener('keydown', this.handleKeyDown);
    document.removeEventListener(
      'visibilitychange',
      this.handleVisibilityChange,
    );
  }

  private captureElements(): void {
    this.shell = this.required('.notes-shell');
    this.listHost = this.required('.notes-list');
    this.listStatus = this.required('.list-status');
    this.searchInput = this.required('.search-field input');
    this.activeTab = this.required('[data-tab="active"]');
    this.archivedTab = this.required('[data-tab="archived"]');
    this.activeCount = this.required('[data-active-count]');
    this.archivedCount = this.required('[data-archived-count]');
    this.createButton = this.required('[data-create]');
    this.mobileCreateButton = this.required('[data-mobile-create]');
    this.mobileBackButton = this.required('.mobile-back');
    this.editorContent = this.required('.editor-content');
    this.editorEmpty = this.required('.editor-empty');
    this.titleInput = this.required('.title-input');
    this.markdownToolbar = this.required('[data-markdown-toolbar]');
    this.bodyHost = this.required('.body-host');
    this.updatedLabel = this.required('.updated-label');
    this.saveLabel = this.required('.save-label');
    this.pinButton = this.required('.pin-button');
    this.archiveButton = this.required('.archive-button');
    this.deleteButton = this.required('.delete-button');
    this.retryButton = this.required('.retry-button');
    this.accountTrigger = this.required('.account__trigger');
    this.accountPopover = this.required('.account__popover');
    this.toast = this.required('.toast');
  }

  private decorateStaticElements(): void {
    this.required('[data-brand-icon]').appendChild(createIcon('document', 19));
    this.required('[data-search-icon]').appendChild(createIcon('search', 17));
    this.required('[data-mobile-create-icon]').appendChild(createIcon('plus', 18));
    this.required('[data-empty-icon]').appendChild(createIcon('document', 24));
    setButtonIcon(this.createButton, 'plus', 'Нова нотатка');
    setButtonIcon(this.mobileBackButton, 'back', 'Назад до списку');
    setButtonIcon(this.deleteButton, 'trash', 'Видалити нотатку');

    const initial = this.options.user.email.trim().charAt(0).toUpperCase() || 'M';
    this.root.querySelectorAll<HTMLElement>('.account__avatar').forEach((avatar) => {
      avatar.textContent = initial;
    });
    this.required('.account__identity strong').textContent = this.options.user.email;
  }

  private bindEvents(): void {
    this.createButton.addEventListener('click', () => void this.createNote());
    this.mobileCreateButton.addEventListener('click', () => void this.createNote());
    this.required<HTMLButtonElement>('[data-empty-create]').addEventListener(
      'click',
      () => void this.createNote(),
    );
    this.searchInput.addEventListener('input', () => {
      this.store.setSearch(this.searchInput.value);
    });
    this.activeTab.addEventListener('click', () => this.store.setListMode('active'));
    this.archivedTab.addEventListener('click', () =>
      this.store.setListMode('archived'),
    );
    this.mobileBackButton.addEventListener('click', () => {
      void this.store.flush();
      this.mobileView = 'list';
      this.syncMobileView();
    });
    this.titleInput.addEventListener('input', () => {
      this.store.updateDraft({ title: this.titleInput.value });
    });
    this.markdownToolbar.addEventListener('pointerdown', (event) => {
      event.preventDefault();
    });
    this.markdownToolbar.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        '[data-md-command]',
      );
      if (!button || !this.bodyEditor) return;
      const command = this.getToolbarCommand(button);
      if (command) this.bodyEditor.executeCommand(command);
    });
    this.pinButton.addEventListener('click', () => void this.store.togglePin());
    this.archiveButton.addEventListener('click', () =>
      void this.store.toggleArchive(),
    );
    this.deleteButton.addEventListener('click', () => void this.deleteCurrent());
    this.retryButton.addEventListener('click', () => void this.store.reload());

    this.accountTrigger.addEventListener('click', (event) => {
      event.stopPropagation();
      this.setAccountMenuOpen(!this.accountMenuOpen);
    });
    this.required<HTMLButtonElement>('[data-switch-account]').addEventListener(
      'click',
      () => this.options.onSwitchAccount(),
    );
    this.required<HTMLButtonElement>('[data-logout]').addEventListener(
      'click',
      () => void this.options.onLogout(),
    );
    document.addEventListener('click', this.handleDocumentClick);
    document.addEventListener('keydown', this.handleKeyDown);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
  }

  private render(state: Readonly<NotesState>): void {
    this.syncMobileView();
    this.activeCount.textContent = String(state.summary.active);
    this.archivedCount.textContent = String(state.summary.archived);
    this.activeTab.setAttribute(
      'aria-selected',
      String(state.listMode === 'active'),
    );
    this.archivedTab.setAttribute(
      'aria-selected',
      String(state.listMode === 'archived'),
    );
    if (this.searchInput.value !== state.search) this.searchInput.value = state.search;

    this.renderList(state);
    this.renderEditor(state);
    this.renderErrors(state);
  }

  private renderList(state: Readonly<NotesState>): void {
    this.listHost.replaceChildren();
    const notes = this.store.visibleNotes();
    this.listStatus.textContent = '';

    if (state.loading && notes.length === 0) {
      this.listStatus.textContent = 'Завантажуємо нотатки…';
      return;
    }
    if (state.loadError && notes.length === 0) {
      this.listStatus.textContent = state.loadError;
      return;
    }
    if (notes.length === 0) {
      this.listStatus.textContent = state.search.trim()
        ? 'За цим пошуком нотаток не знайдено.'
        : state.listMode === 'active'
          ? 'Активних нотаток поки немає.'
          : 'Архівних нотаток немає.';
      return;
    }

    notes.forEach((note) => {
      const selected = note.id === state.currentNote?.id;
      const row = document.createElement('button');
      row.type = 'button';
      row.className = `note-row${selected ? ' is-selected' : ''}`;
      row.setAttribute('role', 'listitem');
      row.setAttribute('aria-current', selected ? 'true' : 'false');

      const copy = document.createElement('span');
      copy.className = 'note-row__copy';
      const title = document.createElement('strong');
      title.textContent = noteTitle(
        note,
        selected ? state.draftTitle : undefined,
      );
      const snippet = document.createElement('span');
      snippet.textContent =
        createNotesSnippet(selected ? state.draftBody : note.body) ||
        'Порожня нотатка';
      copy.append(title, snippet);
      row.appendChild(copy);

      if (note.is_pinned) {
        const pinned = document.createElement('span');
        pinned.className = 'note-row__pin';
        pinned.title = 'Закріплено';
        pinned.appendChild(createIcon('bookmark', 15));
        row.appendChild(pinned);
      }

      row.addEventListener('click', async () => {
        if (await this.store.selectNote(note.id)) {
          this.mobileView = 'editor';
          this.syncMobileView();
        }
      });
      this.listHost.appendChild(row);
    });
  }

  private renderEditor(state: Readonly<NotesState>): void {
    const note = state.currentNote;
    this.editorEmpty.hidden = note !== null;
    this.editorContent.hidden = note === null;
    if (!note) {
      this.destroyBodyEditor();
      if (this.mobileView === 'editor') {
        this.mobileView = 'list';
        this.syncMobileView();
      }
      return;
    }

    if (this.titleInput.value !== state.draftTitle) {
      this.titleInput.value = state.draftTitle;
    }
    this.updatedLabel.textContent = `Оновлено ${formatUpdatedAt(note.updated_at)}`;
    this.saveLabel.textContent = this.saveStateLabel(state.saveState);
    this.saveLabel.dataset.state = state.saveState;

    const disabled = state.actionPending;
    this.pinButton.disabled = disabled;
    this.archiveButton.disabled = disabled;
    this.deleteButton.disabled = disabled;
    this.createButton.disabled = state.creating;
    this.mobileCreateButton.disabled = state.creating;
    setButtonIcon(
      this.pinButton,
      'bookmark',
      note.is_pinned ? 'Відкріпити нотатку' : 'Закріпити нотатку',
    );
    this.pinButton.classList.toggle('is-active', note.is_pinned);
    setButtonIcon(
      this.archiveButton,
      note.status === 'archived' ? 'unarchive' : 'archive',
      note.status === 'archived' ? 'Повернути з архіву' : 'Архівувати нотатку',
    );

    if (this.renderedNoteId !== note.id || !this.bodyEditor) {
      this.destroyBodyEditor();
      this.renderedNoteId = note.id;
      this.bodyEditor = createNotesBodyEditor({
        value: state.draftBody,
        onChange: (body) => this.store.updateDraft({ body }),
      });
      this.bodyEditor.mount(this.bodyHost);
    } else if (this.bodyEditor.getValue() !== state.draftBody) {
      this.bodyEditor.setValue(state.draftBody);
    }
  }

  private renderErrors(state: Readonly<NotesState>): void {
    this.retryButton.hidden = !state.loadError;
    const message = state.mutationError;
    if (!message || message === this.lastToastMessage) return;
    this.lastToastMessage = message;
    this.toast.textContent = message;
    this.toast.hidden = false;
    if (this.toastTimer) clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => {
      this.toast.hidden = true;
      this.lastToastMessage = null;
      this.store.clearMutationError();
    }, 4200);
  }

  private async createNote(): Promise<void> {
    const note = await this.store.createNote();
    if (!note) return;
    this.mobileView = 'editor';
    this.syncMobileView();
    requestAnimationFrame(() => {
      this.titleInput.focus();
      this.titleInput.select();
    });
  }

  private async deleteCurrent(): Promise<void> {
    const state = this.store.snapshot;
    if (!state.currentNote) return;
    const confirmed = await this.confirmDialog.open(
      noteTitle(state.currentNote, state.draftTitle),
    );
    if (!confirmed) return;
    const deleted = await this.store.deleteCurrentNote();
    if (deleted && !this.store.snapshot.currentNote) {
      this.mobileView = 'list';
      this.syncMobileView();
    }
  }

  private saveStateLabel(state: NotesState['saveState']): string {
    switch (state) {
      case 'queued':
        return 'Очікує збереження';
      case 'saving':
        return 'Зберігаємо…';
      case 'saved':
        return 'Збережено';
      case 'error':
        return 'Не збережено';
      default:
        return '';
    }
  }

  private destroyBodyEditor(): void {
    this.bodyEditor?.destroy();
    this.bodyEditor = null;
    this.renderedNoteId = null;
    this.bodyHost?.replaceChildren();
  }

  private getToolbarCommand(button: HTMLButtonElement): InkstoneCommand | null {
    const type = button.dataset.mdCommand;
    switch (type) {
      case 'heading': {
        const level = Number(button.dataset.level);
        return level === 1 || level === 2 || level === 3
          ? { type, level }
          : null;
      }
      case 'bold':
      case 'italic':
      case 'inline-code':
      case 'bullet-list':
      case 'ordered-list':
      case 'task-list':
      case 'blockquote':
      case 'code-block':
      case 'link':
        return { type };
      default:
        return null;
    }
  }

  private syncMobileView(): void {
    this.shell.dataset.mobileView = this.mobileView;
  }

  private setAccountMenuOpen(open: boolean): void {
    this.accountMenuOpen = open;
    this.accountPopover.hidden = !open;
    this.accountTrigger.setAttribute('aria-expanded', String(open));
  }

  private readonly handleDocumentClick = (): void => {
    if (this.accountMenuOpen) this.setAccountMenuOpen(false);
  };

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (event.key === 'Escape' && this.accountMenuOpen) {
      this.setAccountMenuOpen(false);
      this.accountTrigger.focus();
      return;
    }
    if (!(event.ctrlKey || event.metaKey)) return;
    if (event.key.toLowerCase() === 'n') {
      event.preventDefault();
      void this.createNote();
    }
    if (event.key.toLowerCase() === 's') {
      event.preventDefault();
      void this.store.flush();
    }
  };

  private readonly handleVisibilityChange = (): void => {
    if (document.visibilityState === 'hidden') void this.store.flush();
  };

  private required<T extends HTMLElement = HTMLElement>(selector: string): T {
    const element = this.root.querySelector<T>(selector);
    if (!element) throw new Error(`Missing workspace element: ${selector}`);
    return element;
  }
}
