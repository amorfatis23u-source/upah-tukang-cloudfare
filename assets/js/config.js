const RETRY_DELAYS = [0, 600, 1400];
const SNAP_PREFIX = 'ut:snap:';

const isPromiseLike = (value) => value && typeof value.then === 'function';

function normaliseBase(base = '/api') {
  if (!base) return '';
  if (/^https?:/i.test(base)) return base.replace(/\/$/, '');
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function readMetaContent(name) {
  if (typeof document === 'undefined') return '';
  const el = document.querySelector(`meta[name="${name}"]`);
  if (!el) return '';
  return (el.getAttribute('content') || '').trim();
}

function resolveGlobalOptions(baseOrOptions) {
  const options = {};

  if (typeof window !== 'undefined') {
    const globalConfig = window.__UPAH_CONFIG__ || window.UpahConfig || {};
    Object.assign(options, globalConfig);

    if (!options.appsScriptUrl && typeof window.UPAH_APPS_SCRIPT_URL === 'string') {
      options.appsScriptUrl = window.UPAH_APPS_SCRIPT_URL;
    }
    if (!options.baseUrl && typeof window.UPAH_API_BASE_URL === 'string') {
      options.baseUrl = window.UPAH_API_BASE_URL;
    }
  }

  const metaScript = readMetaContent('upah-apps-script-url');
  if (!options.appsScriptUrl && metaScript) {
    options.appsScriptUrl = metaScript;
  }

  const metaBase = readMetaContent('upah-api-base-url');
  if (!options.baseUrl && metaBase) {
    options.baseUrl = metaBase;
  }

  if (typeof baseOrOptions === 'string') {
    options.baseUrl = baseOrOptions;
  } else if (baseOrOptions && typeof baseOrOptions === 'object') {
    Object.assign(options, baseOrOptions);
  }

  if (options.appsScriptUrl) {
    options.appsScriptUrl = String(options.appsScriptUrl).trim();
    if (!options.appsScriptUrl) {
      delete options.appsScriptUrl;
    }
  }

  if (options.baseUrl) {
    options.baseUrl = String(options.baseUrl).trim();
    if (!options.baseUrl) {
      delete options.baseUrl;
    }
  }

  return options;
}

async function jsonRequest(path, {
  method = 'GET',
  body,
  retryDelays = RETRY_DELAYS,
  headers: extraHeaders,
  contentType,
  credentials = 'same-origin',
  allowOkFalse = false
} = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    const wait = retryDelays[attempt];
    if (wait) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    try {
      const opts = { method, headers: { Accept: 'application/json', ...(extraHeaders || {}) }, credentials };
      if (body !== undefined) {
        const isString = typeof body === 'string';
        opts.body = isString ? body : JSON.stringify(body);
        let finalType = contentType;
        if (typeof finalType === 'undefined') {
          finalType = isString ? 'text/plain;charset=utf-8' : 'application/json; charset=utf-8';
        }
        if (finalType) {
          opts.headers['Content-Type'] = finalType;
        }
      }
      const res = await fetch(path, opts);
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (res.status === 404) {
        return { ok: false, status: 404, ...data };
      }
      if (!res.ok) {
        const msg = data?.error || res.statusText || 'Request gagal';
        throw new Error(msg);
      }
      if (data?.ok === false) {
        if (allowOkFalse) {
          return data;
        }
        const msg = data?.error || 'Request gagal';
        throw new Error(msg);
      }
      return data;
    } catch (err) {
      lastErr = err;
      if (attempt === retryDelays.length - 1) {
        throw err;
      }
    }
  }
  throw lastErr || new Error('Gagal memuat');
}

function createKvRequest(baseUrl = '/api') {
  const normalised = normaliseBase(baseUrl || '/api');
  const toUrl = (path = '') => {
    if (/^https?:/i.test(path)) return path;
    if (!normalised) return path || '';
    if (!path) return normalised;
    return `${normalised}${path.startsWith('/') ? '' : '/'}${path}`;
  };
  return function request(path, options = {}) {
    return jsonRequest(toUrl(path), options);
  };
}

function createAppsScriptRequest(scriptUrl) {
  const baseUrl = String(scriptUrl || '').trim();
  if (!baseUrl) {
    throw new Error('Apps Script URL tidak valid');
  }

  return function request(path = '', options = {}) {
    const dummy = new URL(path || '/', 'https://dummy.local');
    const pathname = dummy.pathname.replace(/^\/+/, '');
    const params = dummy.searchParams;
    const url = new URL(baseUrl);
    const query = url.searchParams;

    const finalOptions = { ...options };
    let method = (finalOptions.method || 'GET').toUpperCase();
    let body = finalOptions.body;
    let action = '';

    const ensureBodyObject = () => {
      if (body === undefined || body === null) {
        body = {};
        return;
      }
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body);
        } catch (err) {
          body = {};
        }
        return;
      }
      if (typeof body !== 'object') {
        body = {};
      }
    };

    if (pathname === 'state' || pathname === '') {
      if (method === 'GET') {
        action = 'get';
        const key = params.get('key') || (body && body.key);
        if (key) {
          query.set('key', key);
        }
        body = undefined;
      } else if (method === 'POST') {
        action = 'set';
        ensureBodyObject();
      } else if (method === 'DELETE') {
        action = 'delete';
        const key = params.get('key') || (body && body.key);
        body = key ? { key } : {};
        method = 'POST';
      } else {
        throw new Error(`Metode ${method} tidak didukung untuk Apps Script state`);
      }
    } else if (pathname === 'list') {
      const wantValues = params.get('values') === '1';
      action = wantValues ? 'listWithValues' : 'list';
      if (params.has('prefix')) query.set('prefix', params.get('prefix'));
      if (params.has('cursor')) query.set('cursor', params.get('cursor'));
      if (params.has('limit')) query.set('limit', params.get('limit'));
      body = undefined;
      method = 'GET';
    } else {
      throw new Error(`Path Apps Script tidak dikenal: ${pathname || '/'}`);
    }

    if (!action) {
      throw new Error('Aksi Apps Script tidak ditemukan');
    }

    query.set('action', action);

    const requestInit = {
      method,
      retryDelays: finalOptions.retryDelays,
      headers: finalOptions.headers,
      credentials: 'omit',
      allowOkFalse: action === 'get'
    };

    if (body !== undefined) {
      requestInit.body = typeof body === 'string' ? body : JSON.stringify(body);
      requestInit.contentType = finalOptions.contentType || 'text/plain;charset=utf-8';
    }

    return jsonRequest(url.toString(), requestInit);
  };
}

function createClient(request, { snapPrefix = SNAP_PREFIX } = {}) {
  const client = {};
  const snapshotListeners = new Set();

  const notifySnapshotListeners = async (payload) => {
    for (const listener of snapshotListeners) {
      try {
        const result = listener(payload);
        if (isPromiseLike(result)) {
          await result;
        }
      } catch (err) {
        console.error('snapshot listener error', err);
      }
    }
  };

  const mapSnapshotItems = (rawItems = []) => {
    return rawItems
      .map((item) => {
        const key = item?.key || item?.name || '';
        if (!key) return null;
        const meta = item?.meta && typeof item.meta === 'object' ? item.meta : (item?.metadata || {});
        return {
          key,
          meta,
          metadata: meta
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const tb = Date.parse(b.meta?.updatedAt || '') || Date.parse(b.meta?.created || b.meta?.createdAt || '') || 0;
        const ta = Date.parse(a.meta?.updatedAt || '') || Date.parse(a.meta?.created || a.meta?.createdAt || '') || 0;
        return tb - ta;
      });
  };

  const fetchSnapshotResponse = async (prefix = snapPrefix) => {
    const search = new URLSearchParams();
    if (prefix) search.set('prefix', prefix);
    const query = search.toString();
    const res = await request(`/list${query ? `?${query}` : ''}`);
    const items = mapSnapshotItems(res?.items);
    return {
      prefix: prefix || '',
      cursor: res?.cursor ?? null,
      items,
      keys: items.map((item) => ({ name: item.key, metadata: item.meta, meta: item.meta })),
      count: items.length,
      list_complete: res?.list_complete ?? true
    };
  };

  const emitSnapshotChange = async (action, { key = null, meta = null, prefix = snapPrefix } = {}) => {
    const response = await fetchSnapshotResponse(prefix);
    const payload = {
      action,
      key,
      meta,
      prefix,
      items: response.items,
      cursor: response.cursor,
      response
    };
    if (snapshotListeners.size > 0) {
      await notifySnapshotListeners(payload);
    }
    return payload;
  };

  client.getRaw = async function getRaw(key) {
    if (!key) throw new Error('key wajib');
    const res = await request(`/state?key=${encodeURIComponent(key)}`, { allowOkFalse: true });
    return res?.value ?? null;
  };

  client.setRaw = async function setRaw(key, value) {
    if (!key) throw new Error('key wajib');
    return request('/state', { method: 'POST', body: { key, value } });
  };

  client.del = async function del(key) {
    if (!key) throw new Error('key wajib');
    return request(`/state?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  };

  client.listSnapshots = async function listSnapshots(prefix = snapPrefix, arg1 = {}, arg2 = {}) {
    let cursor = '';
    let limit = 100;
    let values = false;

    if (typeof arg1 === 'object' && arg1 !== null && !Array.isArray(arg1)) {
      cursor = arg1.cursor ?? '';
      limit = arg1.limit ?? limit;
      values = arg1.values ?? values;
    } else if (typeof arg1 === 'string') {
      cursor = arg1;
      if (typeof arg2 === 'number') {
        limit = arg2;
      } else if (typeof arg2 === 'object' && arg2 !== null) {
        limit = arg2.limit ?? limit;
        values = arg2.values ?? values;
      }
    } else if (typeof arg1 === 'number') {
      limit = arg1;
    }

    const parsedCursor = Number.isFinite(Number.parseInt(cursor, 10)) ? Number.parseInt(cursor, 10) : 0;
    const response = await fetchSnapshotResponse(prefix);
    const startIndex = Math.max(0, parsedCursor);
    const endIndex = startIndex + Math.max(1, Number.parseInt(limit, 10) || 1);
    const pageItems = response.items.slice(startIndex, endIndex);
    const nextCursor = endIndex < response.items.length ? String(endIndex) : '';

    const payload = {
      ...response,
      cursor: nextCursor,
      count: pageItems.length,
      list_complete: !nextCursor,
      keys: pageItems.map((item) => ({ name: item.key, metadata: item.meta, meta: item.meta }))
    };

    if (values) {
      const detailed = await Promise.all(
        pageItems.map(async (item) => {
          const detail = await client.get(item.key);
          return { ...item, value: detail?.value ?? null, meta: detail?.meta ?? item.meta };
        })
      );
      payload.items = detailed;
    } else {
      payload.items = pageItems;
    }

    return payload;
  };

  client.makeSnapKey = function makeSnapKey({ periodeStart, periodeEnd, rumah, uuid }) {
    const clean = (val) => {
      if (val === null || val === undefined) return '';
      return String(val).trim().replace(/\s+/g, '-');
    };
    const ps = clean(periodeStart);
    const pe = clean(periodeEnd);
    const rm = clean(rumah);
    const id = uuid || (crypto?.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2));
    return `${SNAP_PREFIX}${ps}:${pe}:${rm}:${id}`;
  };

  client.get = async function get(key) {
    if (!key) throw new Error('key wajib');
    return request(`/state?key=${encodeURIComponent(key)}`, { allowOkFalse: true });
  };

  client.set = async function set(key, value, meta = {}) {
    if (!key) throw new Error('key wajib');
    const res = await request('/state', { method: 'POST', body: { key, value, meta } });
    if (key.startsWith(SNAP_PREFIX)) {
      await emitSnapshotChange('save', { key, meta: res?.meta ?? meta, prefix: snapPrefix });
    }
    return res;
  };

  client.deleteKey = async function deleteKey(key) {
    return client.del(key);
  };

  client.list = async function list(prefix = '', cursor = '', limit = 50, options = {}) {
    const search = new URLSearchParams();
    if (prefix) search.set('prefix', prefix);
    if (cursor) search.set('cursor', cursor);
    if (limit) search.set('limit', String(limit));
    if (options?.values) search.set('values', '1');
    const query = search.toString();
    return request(`/list${query ? `?${query}` : ''}`);
  };

  client.refreshSnapshotList = async function refreshSnapshotList(prefix = snapPrefix) {
    const payload = await emitSnapshotChange('refresh', { key: null, meta: null, prefix });
    return payload.response;
  };

  client.onSnapshotListChange = function onSnapshotListChange(listener) {
    if (typeof listener !== 'function') {
      return () => {};
    }
    snapshotListeners.add(listener);
    return () => {
      snapshotListeners.delete(listener);
    };
  };

  const originalDel = client.del;
  client.del = async function wrappedDel(key) {
    if (!key) throw new Error('key wajib');
    const res = await originalDel(key);
    if (key.startsWith(SNAP_PREFIX)) {
      await emitSnapshotChange('delete', { key, meta: null, prefix: snapPrefix });
    }
    return res;
  };

  return client;
}

export function api(baseOrOptions = '/api') {
  const options = resolveGlobalOptions(baseOrOptions);
  const snapPrefix = typeof options.snapPrefix === 'string' && options.snapPrefix.trim()
    ? options.snapPrefix.trim()
    : SNAP_PREFIX;
  let request;

  if (options.appsScriptUrl) {
    request = createAppsScriptRequest(options.appsScriptUrl);
  } else {
    request = createKvRequest(options.baseUrl || '/api');
  }

  return createClient(request, { snapPrefix });
}

const defaultClient = api();

export const API = {
  async get(key) {
    return defaultClient.get(key);
  },
  async set(key, value, meta = {}) {
    return defaultClient.set(key, value, meta);
  },
  async del(key) {
    return defaultClient.del(key);
  },
  async listSnapshots(prefix = SNAP_PREFIX, arg1 = {}, arg2 = {}) {
    return defaultClient.listSnapshots(prefix, arg1, arg2);
  },
  async list(prefix, cursor = '', limit = 50) {
    return defaultClient.list(prefix, cursor, limit);
  },
  async refreshSnapshots(prefix = SNAP_PREFIX) {
    return defaultClient.refreshSnapshotList(prefix);
  },
  onSnapshotListChange(listener) {
    return defaultClient.onSnapshotListChange(listener);
  }
};

export const utils = {
  debounce(fn, wait = 300) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), wait);
    };
  },
  formatRupiah(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(n);
  },
  formatNumber(value) {
    const n = Number(value) || 0;
    return new Intl.NumberFormat('id-ID').format(n);
  },
  todayISO() {
    return new Date().toISOString().slice(0, 10);
  },
  plusDaysISO(date, add = 0) {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + add);
    return d.toISOString().slice(0, 10);
  },
  uuid() {
    if (crypto?.randomUUID) return crypto.randomUUID();
    return 'xxxxxx4xyx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  },
  parseSnapshotKey(key = '') {
    const parts = key.split(':');
    return {
      raw: key,
      start: parts[2] || '',
      end: parts[3] || '',
      rumah: parts[4] || '',
      uuid: parts[5] || ''
    };
  },
  toCSV(filename, rows) {
    if (!rows?.length) throw new Error('Tidak ada data untuk diexport');
    const headers = Object.keys(rows[0]);
    const escape = (val) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/\r?\n/g, ' ');
      if (/[",;\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csv = [headers.join(',')].concat(rows.map((row) => headers.map((h) => escape(row[h])).join(','))).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  },
  toXLSX(filename, sheets) {
    if (!window.XLSX) throw new Error('SheetJS belum dimuat');
    const wb = XLSX.utils.book_new();
    Object.entries(sheets).forEach(([name, rows]) => {
      const sheet = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, sheet, name.slice(0, 31));
    });
    XLSX.writeFile(wb, filename, { compression: true });
  },
  sumRows(rows = []) {
    return rows.reduce((acc, row) => acc + ((Number(row.tarif) || 0) * (Number(row.hari) || 0)), 0);
  },
  sumDays(rows = []) {
    return rows.reduce((acc, row) => acc + (Number(row.hari) || 0), 0);
  },
  parseCSV(text) {
    const rows = [];
    const lines = text.split(/\r?\n/).filter((line) => line.trim().length);
    if (!lines.length) {
      return { headers: [], rows: [] };
    }
    const headers = lines[0].split(',').map((h) => h.trim());
    for (let i = 1; i < lines.length; i++) {
      const cells = lines[i].split(',');
      const obj = {};
      headers.forEach((h, idx) => {
        obj[h] = (cells[idx] ?? '').trim();
      });
      rows.push(obj);
    }
    return { headers, rows };
  }
};

export function showToast(message, type = 'info') {
  const containerId = 'toast-container';
  let container = document.getElementById(containerId);
  if (!container) {
    container = document.createElement('div');
    container.id = containerId;
    container.className = 'toast-container';
    container.setAttribute('aria-live', 'polite');
    document.body.appendChild(container);
  }
  const item = document.createElement('div');
  item.className = `toast-item show ${type}`;
  item.textContent = message;
  container.appendChild(item);
  setTimeout(() => {
    item.classList.remove('show');
    setTimeout(() => item.remove(), 200);
  }, 2800);
}

export function formatError(err) {
  if (!err) return 'Terjadi kesalahan';
  if (typeof err === 'string') return err;
  return err.message || 'Terjadi kesalahan tak diketahui';
}

export const UpahAPI = defaultClient;

if (typeof window !== 'undefined') {
  window.UpahAPI = window.UpahAPI || defaultClient;
}
