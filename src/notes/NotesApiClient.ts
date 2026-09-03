import type { AuthClient } from '../auth/AuthClient.ts';
import type {
  Note,
  NoteCreatePayload,
  NotePatchPayload,
  NoteStatus,
  NoteSummary,
  PaginatedResponse,
} from './types.ts';

export type NoteListOptions = {
  status?: NoteStatus;
  search?: string;
  page?: number;
  pageSize?: number;
  isPinned?: boolean;
};

export class NotesApiClient {
  constructor(private readonly auth: Pick<AuthClient, 'request'>) {}

  public list(options: NoteListOptions = {}): Promise<PaginatedResponse<Note>> {
    const query = new URLSearchParams();
    if (options.status) query.set('status', options.status);
    if (options.search?.trim()) query.set('search', options.search.trim());
    if (options.page !== undefined) query.set('page', String(options.page));
    if (options.pageSize !== undefined) {
      query.set('page_size', String(options.pageSize));
    }
    if (options.isPinned !== undefined) {
      query.set('is_pinned', String(options.isPinned));
    }
    const suffix = query.size > 0 ? `?${query.toString()}` : '';
    return this.auth.request(`/notes/${suffix}`);
  }

  public summary(): Promise<NoteSummary> {
    return this.auth.request('/notes/summary/');
  }

  public create(payload: NoteCreatePayload): Promise<Note> {
    return this.auth.request('/notes/', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  public patch(id: string, payload: NotePatchPayload): Promise<Note> {
    return this.auth.request(`/notes/${encodeURIComponent(id)}/`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  }

  public delete(id: string): Promise<void> {
    return this.auth.request(`/notes/${encodeURIComponent(id)}/`, {
      method: 'DELETE',
    });
  }

  public pin(id: string): Promise<Note> {
    return this.action(id, 'pin');
  }

  public unpin(id: string): Promise<Note> {
    return this.action(id, 'unpin');
  }

  public archive(id: string): Promise<Note> {
    return this.action(id, 'archive');
  }

  public unarchive(id: string): Promise<Note> {
    return this.action(id, 'unarchive');
  }

  private action(
    id: string,
    action: 'pin' | 'unpin' | 'archive' | 'unarchive',
  ): Promise<Note> {
    return this.auth.request(
      `/notes/${encodeURIComponent(id)}/${action}/`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      },
    );
  }
}
