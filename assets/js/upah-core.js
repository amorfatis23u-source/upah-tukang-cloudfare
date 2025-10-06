import { API, utils, showToast, formatError } from './config.js';

export const STORAGE_ROOT_KEY = 'upahTukang';

// ===== Defaults =====
export const defaultClassRates = {
  mandor: { key: 'mandor', label: 'Mandor', rate: 150000 },
  tukang: { key: 'tukang', label: 'Tukang', rate: 120000 },
  pekerja: { key: 'pekerja', label: 'Pekerja', rate: 100000 }
};

export const defaultRumahList = [
  { id: 'blok-a-01', label: 'Blok A-01' },
  { id: 'blok-a-02', label: 'Blok A-02' },
  { id: 'blok-b-01', label: 'Blok B-01' }
];

export const groupList = [
  { key: 'mandor', label: 'Mandor' },
  { key: 'tukang', label: 'Tukang' },
  { key: 'pekerja', label: 'Pekerja Harian' }
];

export const dayKeys = ['hari1', 'hari2', 'hari3', 'hari4', 'hari5', 'hari6', 'hari7'];

export const displayDayOrder = dayKeys.map((key, index) => ({ key, label: `Hari ${index + 1}` }));

export const defaultRows = [
  { nama: '', tarif: 0, hari: 0 }
];

// ===== Helpers =====
function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

export function cloneDefaultRows() {
  return deepClone(defaultRows);
}

export function cloneDefaultRates() {
  return deepClone(defaultClassRates);
}

export function cloneDefaultRumah() {
  return deepClone(defaultRumahList);
}

export function readStorageRoot() {
  try {
    const raw = window.localStorage.getItem(STORAGE_ROOT_KEY);
    if (!raw) {
      return { items: {}, lastKey: null };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      throw new Error('Root storage invalid');
    }
    return {
      items: parsed.items && typeof parsed.items === 'object' ? parsed.items : {},
      lastKey: parsed.lastKey || null
    };
  } catch (err) {
    console.warn('readStorageRoot fallback', err);
    return { items: {}, lastKey: null };
  }
}

export function persistStorageRoot(root) {
  const safe = {
    items: root.items || {},
    lastKey: root.lastKey || null
  };
  window.localStorage.setItem(STORAGE_ROOT_KEY, JSON.stringify(safe));
}

export function createDefaultItem(overrides = {}) {
  return {
    key: '',
    periodStart: '',
    periodEnd: '',
    rumah: '',
    classRates: cloneDefaultRates(),
    rumahList: cloneDefaultRumah(),
    allowance: { threshold: 0, amount: 0 },
    rows: cloneDefaultRows(),
    meta: {},
    ...overrides
  };
}

// ===== API client =====
let apiClientInstance = null;

export function ensureApiClient() {
  if (!apiClientInstance) {
    apiClientInstance = {
      async saveData(key, value, meta = {}) {
        return API.set(key, value, meta);
      },
      async loadData(key) {
        return API.get(key);
      },
      async deleteData(key) {
        return API.del(key);
      },
      async list(prefix, cursor = '', limit = 50) {
        return API.list(prefix, cursor, limit);
      }
    };
  }
  return apiClientInstance;
}

// ===== Period helpers =====
function resolveEndDate(start) {
  if (!start) return '';
  const end = utils.plusDaysISO(start, 6);
  return end || '';
}

export function updatePeriod(ctx) {
  if (!ctx) return;
  const { state, dom } = ctx;
  if (dom?.periodStart) {
    const startVal = dom.periodStart.value;
    const endVal = resolveEndDate(startVal);
    if (dom.periodEnd) {
      dom.periodEnd.value = endVal;
    }
    state.periodStart = startVal || '';
    state.periodEnd = endVal || '';
  }
}

export function syncPeriodInputs(ctx) {
  if (!ctx) return;
  const { state, dom } = ctx;
  if (dom?.periodStart) {
    dom.periodStart.value = state.periodStart || '';
  }
  if (dom?.periodEnd) {
    dom.periodEnd.value = state.periodEnd || '';
  }
}

// ===== UI/bootstrap hooks =====
function ensureRows(state) {
  if (!Array.isArray(state.rows) || !state.rows.length) {
    state.rows = cloneDefaultRows();
  }
}

function computeSummary(rows = []) {
  const totalRows = rows.length;
  const totalDays = utils.sumDays(rows);
  const totalAmount = utils.sumRows(rows);
  return { totalRows, totalDays, totalAmount };
}

export function rerender(ctx) {
  if (!ctx) return;
  const { state, dom } = ctx;
  ensureRows(state);
  if (dom?.tbody) {
    dom.tbody.innerHTML = '';
    state.rows.forEach((row, index) => {
      const isLocked = state.rows.length === 1;
      const tr = document.createElement('tr');
      tr.dataset.index = String(index);
      tr.className = 'transition hover:bg-slate-50';
      const total = (Number(row.tarif) || 0) * (Number(row.hari) || 0);
      tr.innerHTML = `
        <td class="py-2 pr-3">
          <input class="nm w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200" value="${row.nama || ''}" placeholder="Nama Tukang">
        </td>
        <td class="py-2 pr-3">
          <input class="tarif w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200" type="number" min="0" step="1000" value="${row.tarif ?? 0}" aria-label="Tarif per hari">
        </td>
        <td class="py-2 pr-3">
          <input class="hari w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700 focus:border-orange-400 focus:outline-none focus:ring-2 focus:ring-orange-200" type="number" min="0" max="7" value="${row.hari ?? 0}" aria-label="Jumlah hari kerja">
        </td>
        <td class="py-2 pr-3 text-right font-medium text-slate-800">${utils.formatRupiah(total)}</td>
        <td class="py-2 pr-3 text-right">
          <button class="btnDelRow rounded-xl border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:border-red-300" ${isLocked ? 'disabled' : ''}>Hapus</button>
        </td>
      `;
      if (isLocked) {
        const btn = tr.querySelector('.btnDelRow');
        if (btn) {
          btn.classList.add('opacity-40', 'cursor-not-allowed');
        }
      }
      dom.tbody.appendChild(tr);
    });
  }
  const summary = computeSummary(state.rows);
  if (dom?.totalRows) {
    dom.totalRows.textContent = utils.formatNumber(summary.totalRows);
  }
  if (dom?.totalDays) {
    dom.totalDays.textContent = utils.formatNumber(summary.totalDays);
  }
  if (dom?.totalAmount) {
    dom.totalAmount.textContent = utils.formatRupiah(summary.totalAmount);
  }
}

export function bootRatesUI(ctx) {
  if (!ctx?.state) return;
  if (!ctx.state.classRates) {
    ctx.state.classRates = cloneDefaultRates();
  }
}

export function renderRumah(ctx) {
  if (!ctx) return;
  const { state, dom } = ctx;
  if (dom?.rumahInput) {
    dom.rumahInput.value = state.rumah || '';
  }
}

export function bootBerasUI(ctx) {
  if (!ctx?.state) return;
  if (!ctx.state.allowance) {
    ctx.state.allowance = { threshold: 0, amount: 0 };
  }
}

export function updateBerasRule(ctx, overrides = {}) {
  if (!ctx?.state) return;
  ctx.state.allowance = {
    threshold: overrides.threshold ?? ctx.state.allowance?.threshold ?? 0,
    amount: overrides.amount ?? ctx.state.allowance?.amount ?? 0
  };
}

export function clearRumah(ctx) {
  if (!ctx) return;
  ctx.state.rumah = '';
  renderRumah(ctx);
}

export function addRumah(ctx, rumahLabel) {
  if (!ctx) return;
  if (typeof rumahLabel !== 'string' || !rumahLabel.trim()) return;
  const label = rumahLabel.trim();
  const exists = ctx.state.rumahList?.some?.((item) => item?.label === label);
  if (!exists) {
    ctx.state.rumahList = Array.isArray(ctx.state.rumahList) ? ctx.state.rumahList.slice() : [];
    ctx.state.rumahList.push({ id: label.toLowerCase().replace(/\s+/g, '-'), label });
  }
  ctx.state.rumah = label;
  renderRumah(ctx);
}

export function addWorker(ctx, overrides = {}) {
  if (!ctx?.state) return;
  const row = {
    nama: '',
    tarif: 0,
    hari: 0,
    ...overrides
  };
  ctx.state.rows = Array.isArray(ctx.state.rows) ? ctx.state.rows.slice() : [];
  ctx.state.rows.push(row);
  rerender(ctx);
}

export function restoreDefaultRows(ctx) {
  if (!ctx?.state) return;
  ctx.state.rows = cloneDefaultRows();
  rerender(ctx);
}

// ===== Snapshot & export =====
function collectRowsFromDOM(ctx) {
  const rows = [];
  if (!ctx?.dom?.tbody) return rows;
  ctx.dom.tbody.querySelectorAll('tr').forEach((tr) => {
    const nama = tr.querySelector('.nm')?.value?.trim() || '';
    const tarif = Math.max(0, Number(tr.querySelector('.tarif')?.value) || 0);
    const hari = Math.max(0, Math.min(7, Number(tr.querySelector('.hari')?.value) || 0));
    rows.push({ nama, tarif, hari });
  });
  return rows;
}

export function collectRows(ctx) {
  return collectRowsFromDOM(ctx);
}

export function applySnapshotDataset(ctx, payload = {}, opts = {}) {
  if (!ctx?.state) return;
  const { state } = ctx;
  state.rows = Array.isArray(payload.rows) && payload.rows.length ? deepClone(payload.rows) : cloneDefaultRows();
  state.classRates = payload.classRates ? deepClone(payload.classRates) : cloneDefaultRates();
  state.rumahList = payload.rumahList ? deepClone(payload.rumahList) : cloneDefaultRumah();
  state.allowance = payload.allowance ? deepClone(payload.allowance) : { threshold: 0, amount: 0 };
  state.rumah = payload.rumah || '';
  state.periodStart = payload.periodStart || payload.start || '';
  state.periodEnd = payload.periodEnd || payload.end || resolveEndDate(state.periodStart);
  state.key = payload.key || state.key || '';
  state.meta = payload.meta || state.meta || {};
  syncPeriodInputs(ctx);
  renderRumah(ctx);
  rerender(ctx);
  if (opts.persist !== false) {
    const root = readStorageRoot();
    if (state.key) {
      root.items[state.key] = {
        periodStart: state.periodStart,
        periodEnd: state.periodEnd,
        rumah: state.rumah,
        rows: deepClone(state.rows),
        classRates: deepClone(state.classRates),
        allowance: deepClone(state.allowance)
      };
      root.lastKey = state.key;
      persistStorageRoot(root);
    }
  }
  if (typeof opts.onApplied === 'function') {
    opts.onApplied(ctx);
  }
}

function preparePayload(ctx, opts = {}) {
  if (!ctx?.state) return { payload: {}, meta: {} };
  const rows = collectRowsFromDOM(ctx);
  const start = ctx.dom?.periodStart?.value || ctx.state.periodStart || '';
  const end = ctx.dom?.periodEnd?.value || resolveEndDate(start);
  const rumah = ctx.dom?.rumahInput?.value?.trim() || ctx.state.rumah || '';
  const payload = {
    start,
    end,
    periodStart: start,
    periodEnd: end,
    rumah,
    rows,
    classRates: deepClone(ctx.state.classRates || {}),
    rumahList: deepClone(ctx.state.rumahList || []),
    allowance: deepClone(ctx.state.allowance || { threshold: 0, amount: 0 })
  };
  const total = utils.sumRows(rows);
  const totalDays = utils.sumDays(rows);
  const meta = {
    updatedAt: new Date().toISOString(),
    start,
    end,
    rumah,
    total,
    totalDays
  };
  if (!ctx.state.key) {
    const idFromQuery = opts.newId || new URLSearchParams(window.location.search).get('new') || utils.uuid();
    const rumahSegment = rumah ? rumah.replace(/:/g, '-').trim() : '';
    if (start && end) {
      ctx.state.key = `ut:snap:${start}:${end}:${rumahSegment}:${idFromQuery}`;
    } else {
      ctx.state.key = `ut:snap:${idFromQuery}`;
    }
  }
  return { payload, meta };
}

export async function saveAll(ctx, opts = {}) {
  if (!ctx?.state) return;
  const notifyFallback = opts.notifyFallback ?? opts.manual ?? false;
  const { payload, meta } = preparePayload(ctx, opts);
  if (!payload.start) {
    throw new Error('Tanggal mulai wajib diisi');
  }
  if (!payload.end) {
    throw new Error('Tanggal selesai wajib diisi');
  }
  ctx.state.periodStart = payload.start;
  ctx.state.periodEnd = payload.end;
  ctx.state.rumah = payload.rumah;
  ctx.state.rows = deepClone(payload.rows);
  const api = ensureApiClient();
  try {
    await api.saveData(ctx.state.key, payload, meta);
  } catch (err) {
    if (notifyFallback) {
      try {
        triggerSnapshotDownload(ctx);
        showToast('Gagal menyimpan ke server. Snapshot HTML diunduh.', 'warning');
      } catch (fallbackErr) {
        console.error('fallback snapshot gagal', fallbackErr);
      }
      showToast(formatError(err), 'error');
    }
    throw err;
  }
  const root = readStorageRoot();
  root.items[ctx.state.key] = {
    periodStart: payload.start,
    periodEnd: payload.end,
    rumah: payload.rumah,
    rows: deepClone(payload.rows),
    classRates: deepClone(payload.classRates),
    allowance: deepClone(payload.allowance)
  };
  root.lastKey = ctx.state.key;
  persistStorageRoot(root);
  if (opts.manual) {
    showToast('Data berhasil disimpan', 'success');
  }
  ctx.state.meta = meta;
  return { payload, meta };
}

function buildFilename(prefix, ctx) {
  const start = ctx?.dom?.periodStart?.value || ctx?.state?.periodStart || 'periode';
  const rumah = ctx?.dom?.rumahInput?.value || ctx?.state?.rumah || 'umum';
  return `${prefix}_${start}_${rumah}`.replace(/\s+/g, '_');
}

export function _prepareExportSections(ctx) {
  const rows = collectRowsFromDOM(ctx);
  const start = ctx?.dom?.periodStart?.value || ctx?.state?.periodStart || '';
  const end = ctx?.dom?.periodEnd?.value || ctx?.state?.periodEnd || '';
  const rumah = ctx?.dom?.rumahInput?.value || ctx?.state?.rumah || '';
  const summary = {
    Periode: start && end ? `${start} s/d ${end}` : '',
    Rumah: rumah,
    TotalHari: utils.sumDays(rows),
    TotalUpah: utils.sumRows(rows)
  };
  const detailed = rows.map((row, idx) => ({
    No: idx + 1,
    Nama: row.nama,
    Tarif: row.tarif,
    Hari: row.hari,
    Total: (Number(row.tarif) || 0) * (Number(row.hari) || 0),
    Periode: summary.Periode,
    Rumah: rumah
  }));
  return { detailed, summary: [summary] };
}

export function downloadCSV(ctx) {
  const { detailed } = _prepareExportSections(ctx);
  if (!detailed.length) {
    throw new Error('Tidak ada data untuk diekspor');
  }
  const filename = `${buildFilename('upah', ctx)}.csv`;
  utils.toCSV(filename, detailed);
}

export function downloadXLSX(ctx) {
  const { detailed, summary } = _prepareExportSections(ctx);
  if (!detailed.length) {
    throw new Error('Tidak ada data untuk diekspor');
  }
  const filename = `${buildFilename('upah', ctx)}.xlsx`;
  utils.toXLSX(filename, {
    'Upah Mingguan': detailed,
    Rekap: summary
  });
}

export function exportJSON(ctx) {
  if (!ctx?.state) return;
  const { payload } = preparePayload(ctx);
  const filename = `${buildFilename('upah', ctx)}.json`;
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function triggerSnapshotDownload(ctx) {
  if (!ctx?.state) return;
  const { payload } = preparePayload(ctx);
  const html = `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Snapshot Upah Tukang</title></head><body><pre>${JSON.stringify(payload, null, 2)}</pre></body></html>`;
  const filename = `${buildFilename('snapshot', ctx)}.html`;
  const blob = new Blob([html], { type: 'text/html' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export { utils, showToast, formatError };
