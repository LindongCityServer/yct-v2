export type PoiWorkspace = 'geometry' | 'intro';

export interface PoiEditorReturnContext {
  markerId: string;
  query: string;
  statusFilter: string;
  categoryFilter: string;
  scrollY: number;
  listScrollTop: number;
  createdAt: number;
}

type ContextStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const prefix = 'yct:poi-editor-return:';
const maxAge = 30 * 60 * 1000;

export function isPoiReturnToken(value: string | undefined): value is string {
  return Boolean(value && /^[a-z0-9-]{8,80}$/.test(value));
}

export function buildPoiWorkspaceHref(
  workspace: PoiWorkspace,
  markerId: string,
  token?: string,
): string {
  const params = new URLSearchParams({ markerId });
  if (isPoiReturnToken(token)) params.set('returnContext', token);
  return `/admin/map-poi/${workspace === 'intro' ? 'intro-editor' : 'editor'}?${params}`;
}

export function buildPoiWorkspaceReturnHref(markerId?: string, token?: string): string {
  if (!markerId || !isPoiReturnToken(token)) return '/admin/map-poi';
  const params = new URLSearchParams({ markerId, edit: '1', returnContext: token });
  return `/admin/map-poi?${params}`;
}

export function storePoiReturnContext(
  storage: ContextStorage,
  token: string,
  context: PoiEditorReturnContext,
): void {
  if (!isPoiReturnToken(token)) return;
  try {
    storage.setItem(prefix + token, JSON.stringify(context));
  } catch {
    // Opening the correct modal still works when browser storage is unavailable.
  }
}

export function readPoiReturnContext(
  storage: ContextStorage,
  token: string | undefined,
  markerId: string,
  now = Date.now(),
): PoiEditorReturnContext | undefined {
  if (!isPoiReturnToken(token)) return;
  try {
    const raw = storage.getItem(prefix + token);
    if (!raw) return;
    const value = JSON.parse(raw) as PoiEditorReturnContext;
    const statuses = [
      'all',
      'legacy',
      'todo',
      'blocked',
      'pending_review',
      'approved',
      'rejected',
      'published',
      'archived',
      'draft',
    ];
    if (
      !value ||
      value.markerId !== markerId ||
      typeof value.query !== 'string' ||
      typeof value.categoryFilter !== 'string' ||
      !statuses.includes(value.statusFilter) ||
      !Number.isFinite(value.scrollY) ||
      value.scrollY < 0 ||
      !Number.isFinite(value.listScrollTop) ||
      value.listScrollTop < 0 ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt > now ||
      now - value.createdAt > maxAge
    ) {
      storage.removeItem(prefix + token);
      return;
    }
    return value;
  } catch {
    return;
  }
}

export function removePoiReturnContext(storage: ContextStorage, token?: string): void {
  if (!isPoiReturnToken(token)) return;
  try {
    storage.removeItem(prefix + token);
  } catch {
    // Storage is optional; it must never prevent closing a modal.
  }
}
