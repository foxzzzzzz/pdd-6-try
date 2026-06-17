type StoreRow = {
  cookie?: unknown;
  storageState?: unknown;
  [key: string]: unknown;
};

export function sanitizeStore<TStore extends StoreRow>(store: TStore) {
  const { cookie: _cookie, storageState: _storageState, ...safeStore } = store;
  return safeStore;
}
