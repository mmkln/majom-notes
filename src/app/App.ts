import type { AuthClient } from '../auth/AuthClient.ts';
import type { NotesApiClient } from '../notes/NotesApiClient.ts';
import { NotesStore } from '../notes/NotesStore.ts';
import { NotesWorkspace } from '../notes/NotesWorkspace.ts';
import { createIcon } from '../ui/icons.ts';

export class App {
  private store: NotesStore | null = null;
  private workspace: NotesWorkspace | null = null;

  constructor(
    private readonly root: HTMLElement,
    private readonly auth: AuthClient,
    private readonly notesApi: NotesApiClient,
  ) {}

  public async start(): Promise<void> {
    this.renderLoading();
    try {
      const authenticated = await this.auth.restore();
      if (authenticated && this.auth.currentUser) {
        this.mountWorkspace();
      } else {
        this.renderSignIn();
      }
    } catch (error) {
      console.error('Failed to restore Majom ID session.', error);
      this.renderSignIn('Не вдалося завершити вхід. Спробуйте ще раз.');
    }
  }

  private mountWorkspace(): void {
    const user = this.auth.currentUser;
    if (!user) {
      this.renderSignIn();
      return;
    }
    this.disposeWorkspace();
    this.store = new NotesStore(this.notesApi);
    this.workspace = new NotesWorkspace(this.root, this.store, {
      user,
      onLogout: async () => {
        await this.store?.flush();
        await this.auth.logout();
        this.disposeWorkspace();
        this.renderSignIn();
      },
      onSwitchAccount: () => {
        void this.store?.flush().then(() => this.auth.startLogin(true));
      },
    });
    this.workspace.mount();
  }

  private disposeWorkspace(): void {
    this.workspace?.destroy();
    this.workspace = null;
    this.store?.destroy();
    this.store = null;
  }

  private renderLoading(): void {
    this.root.innerHTML = `
      <main class="auth-screen" aria-busy="true">
        <div class="auth-card auth-card--loading">
          <span class="loading-mark" aria-hidden="true"></span>
          <p>Перевіряємо сесію Majom ID…</p>
        </div>
      </main>
    `;
  }

  private renderSignIn(errorMessage?: string): void {
    this.root.innerHTML = `
      <main class="auth-screen">
        <section class="auth-card">
          <div class="auth-card__mark"></div>
          <p class="eyebrow">Majom</p>
          <h1>Нотатки</h1>
          <p class="auth-card__description">Особистий простір для думок, контексту й важливих деталей.</p>
          <p class="auth-card__error" role="alert" ${errorMessage ? '' : 'hidden'}></p>
          <button class="button button--primary button--block" type="button">Увійти через Majom ID</button>
        </section>
      </main>
    `;
    const mark = this.root.querySelector('.auth-card__mark');
    mark?.appendChild(createIcon('document', 28));
    const error = this.root.querySelector<HTMLElement>('.auth-card__error');
    if (error && errorMessage) error.textContent = errorMessage;
    this.root.querySelector('button')?.addEventListener('click', () => {
      this.auth.startLogin();
    });
  }
}
