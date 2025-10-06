const RETRY_DELAYS = [0, 600, 1400];

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

export const API = {
  async get(key) {
    if (!key) throw new Error('key wajib');
    return jsonRequest(`/api/state?key=${encodeURIComponent(key)}`);
  },
  async set(key, value, meta = {}) {
    if (!key) throw new Error('key wajib');
    return jsonRequest('/api/state', { method: 'POST', body: { key, value, meta } });
  },
  async del(key) {
    if (!key) throw new Error('key wajib');
    return jsonRequest(`/api/state?key=${encodeURIComponent(key)}`, { method: 'DELETE' });
  },
  async list(prefix, cursor = '', limit = 50) {
    const search = new URLSearchParams();
    if (prefix) search.set('prefix', prefix);
    if (cursor) search.set('cursor', cursor);
    if (limit) search.set('limit', String(limit));
    return jsonRequest(`/api/list?${search.toString()}`);
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
