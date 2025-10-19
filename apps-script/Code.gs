const SHEET_NAME = 'Snapshots';
const HEADER_ROW = ['Key', 'Value', 'Meta', 'CreatedAt', 'UpdatedAt'];

function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = (params.action || '').toLowerCase();

    if (!action || action === 'ping') {
      return respond({ ok: true, status: 200, message: 'Apps Script aktif' });
    }

    if (action === 'list' || action === 'listwithvalues') {
      const includeValues = action === 'listwithvalues';
      const prefix = params.prefix || '';
      const items = listSnapshots(prefix, includeValues);
      return respond({ ok: true, status: 200, items, cursor: null, list_complete: true, prefix });
    }

    if (action === 'get') {
      const key = params.key || '';
      const result = loadSnapshot(key);
      return respond(result);
    }

    return respond({ ok: false, status: 400, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return respondError(err);
  }
}

function doPost(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const action = (params.action || '').toLowerCase();
    const payload = parseJson(e && e.postData ? e.postData.contents : '') || {};

    if (action === 'set') {
      const result = saveSnapshot(payload);
      return respond(result);
    }

    if (action === 'delete') {
      const result = deleteSnapshot(payload);
      return respond(result);
    }

    return respond({ ok: false, status: 400, error: 'Aksi tidak dikenal' });
  } catch (err) {
    return respondError(err);
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
  }
  ensureHeader(sheet);
  return sheet;
}

function ensureHeader(sheet) {
  const range = sheet.getRange(1, 1, 1, HEADER_ROW.length);
  const values = range.getValues()[0];
  let needsUpdate = values.length < HEADER_ROW.length;
  for (let i = 0; i < HEADER_ROW.length && !needsUpdate; i++) {
    if (values[i] !== HEADER_ROW[i]) {
      needsUpdate = true;
    }
  }
  if (needsUpdate) {
    range.setValues([HEADER_ROW]);
  }
}

function listSnapshots(prefix, includeValues) {
  const sheet = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return [];
  }
  const rows = sheet.getRange(2, 1, lastRow - 1, HEADER_ROW.length).getValues();
  const items = [];

  for (let i = 0; i < rows.length; i++) {
    const [key, valueRaw, metaRaw, createdAt, updatedAt] = rows[i];
    if (!key) {
      continue;
    }
    if (prefix && String(key).indexOf(prefix) !== 0) {
      continue;
    }
    const value = includeValues ? parseJson(valueRaw, {}) : null;
    const meta = normaliseMeta(parseJson(metaRaw, {}), {
      fallbackValue: value,
      createdAt: createdAt || null,
      updatedAt: updatedAt || null,
      preserveUpdatedAt: true
    });
    meta.updatedAt = updatedAt || meta.updatedAt || meta.createdAt || new Date().toISOString();
    if (!meta.createdAt) {
      meta.createdAt = createdAt || meta.updatedAt;
    }
    const item = { key: String(key), meta, metadata: meta };
    if (includeValues) {
      item.value = value;
    }
    items.push(item);
  }

  items.sort(function (a, b) {
    const tb = Date.parse(b.meta.updatedAt || b.meta.createdAt || '');
    const ta = Date.parse(a.meta.updatedAt || a.meta.createdAt || '');
    return tb - ta;
  });

  return items;
}

function loadSnapshot(key) {
  const cleanKey = (key || '').trim();
  if (!cleanKey) {
    return { ok: false, status: 400, error: 'key wajib' };
  }
  const sheet = getSheet();
  const rowIndex = findRowIndex(sheet, cleanKey);
  if (rowIndex === -1) {
    return { ok: false, status: 404, error: 'Data tidak ditemukan' };
  }
  const row = sheet.getRange(rowIndex, 1, 1, HEADER_ROW.length).getValues()[0];
  const value = parseJson(row[1], {});
  const meta = normaliseMeta(parseJson(row[2], {}), {
    fallbackValue: value,
    createdAt: row[3] || null,
    updatedAt: row[4] || null,
    preserveUpdatedAt: true
  });
  meta.updatedAt = row[4] || meta.updatedAt || new Date().toISOString();
  if (!meta.createdAt) {
    meta.createdAt = row[3] || meta.updatedAt;
  }
  return { ok: true, status: 200, key: cleanKey, value, meta };
}

function saveSnapshot(payload) {
  const key = (payload.key || '').trim();
  if (!key) {
    return { ok: false, status: 400, error: 'key wajib' };
  }
  const value = payload.value || {};
  const sheet = getSheet();
  const nowIso = new Date().toISOString();
  const rowIndex = findRowIndex(sheet, key);
  let createdAt = nowIso;
  if (rowIndex !== -1) {
    const existing = sheet.getRange(rowIndex, 1, 1, HEADER_ROW.length).getValues()[0];
    createdAt = existing[3] || nowIso;
  }

  const meta = normaliseMeta(payload.meta || {}, {
    fallbackValue: value,
    createdAt,
    updatedAt: nowIso
  });
  meta.updatedAt = nowIso;
  if (!meta.createdAt) {
    meta.createdAt = createdAt;
  }

  const rowValues = [
    key,
    JSON.stringify(value),
    JSON.stringify(meta),
    createdAt,
    nowIso
  ];

  if (rowIndex === -1) {
    sheet.appendRow(rowValues);
  } else {
    sheet.getRange(rowIndex, 1, 1, HEADER_ROW.length).setValues([rowValues]);
  }

  return { ok: true, status: rowIndex === -1 ? 201 : 200, key, meta };
}

function deleteSnapshot(payload) {
  const key = (payload && payload.key ? payload.key : '').trim();
  if (!key) {
    return { ok: false, status: 400, error: 'key wajib' };
  }
  const sheet = getSheet();
  const rowIndex = findRowIndex(sheet, key);
  if (rowIndex !== -1) {
    sheet.deleteRow(rowIndex);
  }
  return { ok: true, status: 200 };
}

function findRowIndex(sheet, key) {
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return -1;
  }
  const keys = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (let i = 0; i < keys.length; i++) {
    if (String(keys[i][0]).trim() === key) {
      return i + 2;
    }
  }
  return -1;
}

function normaliseMeta(meta, options) {
  const base = meta && typeof meta === 'object' ? Object.assign({}, meta) : {};
  const fallbackValue = options && options.fallbackValue ? options.fallbackValue : {};
  const start = toDateString(base.periodStart || base.start || fallbackValue.periodStart || fallbackValue.start);
  const end = toDateString(base.periodEnd || base.end || fallbackValue.periodEnd || fallbackValue.end);
  const lokasi = toText(base.lokasi || base.rumah || fallbackValue.lokasi || fallbackValue.rumah);
  const createdAt = options && options.createdAt ? options.createdAt : base.createdAt;
  const updatedAt = options && options.updatedAt ? options.updatedAt : base.updatedAt;
  const preserveUpdatedAt = options && options.preserveUpdatedAt;

  const cleaned = Object.assign({}, base, {
    periodStart: start || null,
    periodEnd: end || null,
    lokasi: lokasi || null
  });

  const judul = toText(base.judul) || buildTitle(lokasi, start, end);
  cleaned.judul = judul;

  if (createdAt) {
    cleaned.createdAt = createdAt;
  }
  if (!preserveUpdatedAt) {
    cleaned.updatedAt = updatedAt || new Date().toISOString();
  } else if (updatedAt) {
    cleaned.updatedAt = updatedAt;
  }

  return cleaned;
}

function buildTitle(lokasi, start, end) {
  if (lokasi && start && end) {
    return `${lokasi} (${start} – ${end})`;
  }
  if (start && end) {
    return `${start} – ${end}`;
  }
  if (lokasi) {
    return lokasi;
  }
  return 'Snapshot';
}

function toDateString(value) {
  if (!value) return '';
  const text = String(value).trim();
  if (!text) return '';
  return text.slice(0, 10);
}

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function parseJson(value, fallback) {
  if (!value) {
    return fallback || null;
  }
  try {
    if (typeof value === 'string') {
      return JSON.parse(value);
    }
    return value;
  } catch (err) {
    return fallback || null;
  }
}

function respond(body) {
  const payload = body || {};
  if (typeof payload.status === 'undefined') {
    payload.status = payload.ok === false ? 400 : 200;
  }
  return ContentService.createTextOutput(JSON.stringify(payload)).setMimeType(ContentService.MimeType.JSON);
}

function respondError(err) {
  const message = err && err.message ? err.message : 'Terjadi kesalahan';
  console.error(err);
  return respond({ ok: false, status: 500, error: message });
}
