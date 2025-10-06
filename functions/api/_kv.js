const MEMORY_KEY = Symbol.for('upah.tukang.memoryKV');

function getMemoryNamespace() {
  const globalSymbols = Object.getOwnPropertySymbols(globalThis);
  if (!globalSymbols.includes(MEMORY_KEY)) {
    globalThis[MEMORY_KEY] = new Map();
  }
  return globalThis[MEMORY_KEY];
}

function createMockKV() {
  const store = getMemoryNamespace();

  return {
    async list(options = {}) {
      const { prefix = '', limit = 100, cursor } = options;
      const allKeys = Array.from(store.keys()).filter((key) => key.startsWith(prefix)).sort();

      let startIndex = 0;
      if (typeof cursor === 'string' && cursor.trim() !== '') {
        const parsedCursor = Number.parseInt(cursor, 10);
        if (Number.isFinite(parsedCursor) && parsedCursor >= 0) {
          startIndex = parsedCursor;
        }
      }

      const slice = allKeys.slice(startIndex, startIndex + limit);
      const nextIndex = startIndex + slice.length;
      const hasMore = nextIndex < allKeys.length;

      return {
        keys: slice.map((name) => {
          const entry = store.get(name) || {};
          return {
            name,
            expiration: null,
            metadata: entry.metadata || {}
          };
        }),
        list_complete: !hasMore,
        cursor: hasMore ? String(nextIndex) : ''
      };
    },

    async getWithMetadata(key, options = {}) {
      if (!store.has(key)) {
        return null;
      }

      const entry = store.get(key);
      let value = entry.value;
      if (options?.type === 'json') {
        try {
          value = JSON.parse(value);
        } catch (err) {
          value = null;
        }
      }

      return {
        value,
        metadata: entry.metadata || {}
      };
    },

    async put(key, value, options = {}) {
      const metadata = options?.metadata || {};
      store.set(key, { value, metadata });
    },

    async delete(key) {
      store.delete(key);
    }
  };
}

export function getKVBinding(env) {
  if (env && env.UPAH_KV && typeof env.UPAH_KV.list === 'function') {
    return { kv: env.UPAH_KV, isMock: false };
  }

  const mockKV = createMockKV();
  console.warn('UPAH_KV binding tidak ditemukan. Menggunakan penyimpanan sementara dalam memori.');
  return { kv: mockKV, isMock: true };
}
