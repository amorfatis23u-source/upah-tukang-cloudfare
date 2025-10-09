const RETRY_DELAYS = [0, 600, 1400];
const DEFAULT_API_BASE = '/api';

async function jsonRequest(path, { method = 'GET', body, retryDelays = RETRY_DELAYS } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < retryDelays.length; attempt++) {
    const wait = retryDelays[attempt];
    if (wait) {
      await new Promise((resolve) => setTimeout(resolve, wait));
    }
    try {
      const opts = { method, headers: { 'Accept': 'application/json' }, credentials: 'same-origin' };
      if (body !== undefined) {
        opts.body = JSON.stringify(body);
        opts.headers['Content-Type'] = 'application/json';
      }
      const res = await fetch(path, opts);
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      if (!res.ok || data?.ok === false) {
        const msg = data?.error || res.statusText || 'Request gagal';
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

function normaliseBase(base = DEFAULT_API_BASE) {
  if (!base) return '';
  if (/^https?:/i.test(base)) return base.replace(/\/$/, '');
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

function resolveBase(base) {
  if (base === undefined) {
    return normaliseBase(DEFAULT_API_BASE);
  }
  return normaliseBase(base);
}

function buildUrl(base, path = '') {
  if (/^https?:/i.test(path)) return path;
  const normalised = normaliseBase(base);
  if (!normalised) {
    if (!path) return '';
    return path.startsWith('/') ? path : `/${path}`;
  }
  if (!path) return normalised;
  return `${normalised}${path.startsWith('/') ? '' : '/'}${path}`;
}

export function apiBase() {
  return DEFAULT_API_BASE;
}

export async function saveSnapshot(data, { base } = {}) {
  const target = buildUrl(resolveBase(base), '/state');
  return jsonRequest(target, { method: 'POST', body: data });
}

export async function getSnapshot(key, { base } = {}) {
  if (!key) throw new Error('key wajib');
  const target = buildUrl(resolveBase(base), `/state?key=${encodeURIComponent(key)}`);
  return jsonRequest(target);
}

export async function deleteSnapshot(key, { base } = {}) {
  if (!key) throw new Error('key wajib');
  const target = buildUrl(resolveBase(base), `/state?key=${encodeURIComponent(key)}`);
  return jsonRequest(target, { method: 'DELETE' });
}

export async function listSnapshots(prefix = 'ut:snap:', options = {}) {
  const { base, cursor, limit, values } = options || {};
  const search = new URLSearchParams();
  if (prefix) search.set('prefix', prefix);
  if (cursor) search.set('cursor', cursor);
  if (limit) search.set('limit', String(limit));
  if (values) search.set('values', '1');
  const query = search.toString();
  const target = buildUrl(resolveBase(base), `/list${query ? `?${query}` : ''}`);
  return jsonRequest(target);
}

export function api(base = DEFAULT_API_BASE) {
  const normalised = resolveBase(base);
  const toUrl = (path = '') => buildUrl(normalised, path);

  const client = {};

  client.getRaw = async function getRaw(key) {
    if (!key) throw new Error('key wajib');
    const res = await getSnapshot(key, { base: normalised });
    if (res && typeof res === 'object') {
      if (res.data !== undefined) return res.data;
      if (res.value !== undefined) return res.value;
    }
    return res ?? null;
  };

  client.setRaw = async function setRaw(key, value) {
    if (!key) throw new Error('key wajib');
    return saveSnapshot({ key, data: value, value }, { base: normalised });
  };

  client.del = async function del(key) {
    if (!key) throw new Error('key wajib');
    return deleteSnapshot(key, { base: normalised });
  };

  client.listSnapshots = async function listSnapshotsClient(prefix = 'ut:snap:', cursorOrOptions, maybeLimit) {
    let opts = {};
    if (cursorOrOptions && typeof cursorOrOptions === 'object' && !Array.isArray(cursorOrOptions)) {
      opts = { ...cursorOrOptions };
    } else {
      if (cursorOrOptions !== undefined && cursorOrOptions !== null && cursorOrOptions !== '') {
        opts.cursor = cursorOrOptions;
      }
      if (maybeLimit !== undefined) {
        opts.limit = maybeLimit;
      }
    }
    return listSnapshots(prefix, { base: normalised, ...opts });
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
    return `ut:snap:${ps}:${pe}:${rm}:${id}`;
  };

  client.get = async function get(key) {
    if (!key) throw new Error('key wajib');
    return getSnapshot(key, { base: normalised });
  };

  client.set = async function set(key, value, meta = {}) {
    if (!key) throw new Error('key wajib');
    return saveSnapshot({ key, data: value, value, meta }, { base: normalised });
  };

  client.deleteKey = async function deleteKey(key) {
    return client.del(key);
  };

  client.list = async function list(prefix = '', cursor = '', limit = 50, options = {}) {
    return listSnapshots(prefix, { base: normalised, cursor, limit, values: options?.values });
  };

  return client;
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
  async list(prefix, cursor = '', limit = 50) {
    return defaultClient.list(prefix, cursor, limit);
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
