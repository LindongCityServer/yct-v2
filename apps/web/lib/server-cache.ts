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
