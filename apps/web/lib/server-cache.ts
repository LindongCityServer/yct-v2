interface TimedCacheEntry<T> {
  key: string;
  value?: T;
  expiresAt: number;
  promise?: Promise<T>;
}

export function createTimedCache<T>(ttlMs: number) {
  let entry: TimedCacheEntry<T> | undefined;

  return {
    read(key: string, loader: () => Promise<T>): Promise<T> {
      const now = Date.now();
      if (entry?.key === key && entry.value !== undefined && entry.expiresAt > now) {
        return Promise.resolve(entry.value);
      }

      if (entry?.key === key && entry.promise) {
        return entry.promise;
      }

      const previous = entry?.key === key ? entry : undefined;
      const promise = loader()
        .then((value) => {
          entry = {
            key,
            value,
            expiresAt: Date.now() + ttlMs,
          };
          return value;
        })
        .catch((error) => {
          entry = previous;
          throw error;
        });

      entry = {
        key,
        value: previous?.value,
        expiresAt: previous?.expiresAt ?? 0,
        promise,
      };

      return promise;
    },
    clear(): void {
      entry = undefined;
    },
  };
}

export function createTimedKeyedCache<T>(ttlMs: number, maxEntries = 128) {
  const entries = new Map<string, Omit<TimedCacheEntry<T>, 'key'>>();

  const trim = () => {
    while (entries.size > maxEntries) {
      const oldestKey = entries.keys().next().value as string | undefined;
      if (!oldestKey) {
        return;
      }
      entries.delete(oldestKey);
    }
  };

  return {
    read(key: string, loader: () => Promise<T>): Promise<T> {
      const now = Date.now();
      const entry = entries.get(key);
      if (entry?.value !== undefined && entry.expiresAt > now) {
        entries.delete(key);
        entries.set(key, entry);
        return Promise.resolve(entry.value);
      }

      if (entry?.promise) {
        return entry.promise;
      }

      const previous = entry;
      const promise = loader()
        .then((value) => {
          entries.delete(key);
          entries.set(key, {
            value,
            expiresAt: Date.now() + ttlMs,
          });
          trim();
          return value;
        })
        .catch((error) => {
          if (previous) {
            entries.set(key, previous);
          } else {
            entries.delete(key);
          }
          throw error;
        });

      entries.set(key, {
        value: previous?.value,
        expiresAt: previous?.expiresAt ?? 0,
        promise,
      });
      trim();
      return promise;
    },
    clear(key?: string): void {
      if (key) {
        entries.delete(key);
      } else {
        entries.clear();
      }
    },
  };
}
