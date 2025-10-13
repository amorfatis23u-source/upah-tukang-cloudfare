import { getKVBinding } from './_kv';

const BASE_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Cache-Control': 'no-store'
};

const JSON_HEADERS = {
  ...BASE_HEADERS,
  'Content-Type': 'application/json; charset=utf-8'
};

export const onRequestOptions = () =>
  new Response(null, {
    status: 204,
    headers: BASE_HEADERS
  });

const PAGE_LIMIT = 200;
const MAX_ITEMS = 1000;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

export async function onRequest({ request, env }) {
  if (request.method === 'OPTIONS') {
    return onRequestOptions();
  }

  if (request.method.toUpperCase() !== 'GET') {
    return json({ ok: false, error: 'Method not allowed' }, 405);
  }

  const { kv } = getKVBinding(env);
  if (!kv) {
    return json({ ok: false, error: 'KV binding UPAH_KV not found' }, 500);
  }

  const url = new URL(request.url);
  const prefix = url.searchParams.get('prefix') || 'ut:snap:';
  let cursor = url.searchParams.get('cursor') || undefined;

  try {
    const items = [];
    let safety = 0;
    do {
      const listOptions = { prefix };
      if (cursor) {
        listOptions.cursor = cursor;
      }
      listOptions.limit = PAGE_LIMIT;

      const page = await kv.list(listOptions);
      for (const entry of page.keys || []) {
        const meta = await resolveMeta(kv, entry);
        items.push({ key: entry.name, meta });
        if (items.length >= MAX_ITEMS) {
          break;
        }
      }

      if (items.length >= MAX_ITEMS || page.list_complete) {
        cursor = null;
      } else {
        cursor = page.cursor || null;
      }

      safety += 1;
      if (!cursor || safety > 50) {
        cursor = null;
      }
    } while (cursor);

    items.sort((a, b) => getTimestamp(b.meta) - getTimestamp(a.meta));

    return json({ items, cursor: null });
  } catch (err) {
    console.error('api/list error', err);
    return json({ ok: false, error: 'Internal Server Error' }, 500);
  }
}

async function resolveMeta(kv, entry) {
  const initial = entry?.metadata && typeof entry.metadata === 'object' ? entry.metadata : null;
  if (initial && Object.keys(initial).length > 0) {
    return normaliseMeta(initial);
  }
  const detail = await kv.getWithMetadata(entry.name);
  return normaliseMeta(detail?.metadata);
}

function normaliseMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  const cleaned = { ...meta };
  if (!cleaned.updatedAt && cleaned.updated_at) {
    cleaned.updatedAt = cleaned.updated_at;
  }
  if (!cleaned.periodStart && cleaned.start) {
    cleaned.periodStart = cleaned.start;
  }
  if (!cleaned.periodEnd && cleaned.end) {
    cleaned.periodEnd = cleaned.end;
  }
  if (!cleaned.lokasi && cleaned.rumah) {
    cleaned.lokasi = cleaned.rumah;
  }
  if (cleaned.periodStart && typeof cleaned.periodStart === 'string') {
    cleaned.periodStart = cleaned.periodStart.slice(0, 10);
  }
  if (cleaned.periodEnd && typeof cleaned.periodEnd === 'string') {
    cleaned.periodEnd = cleaned.periodEnd.slice(0, 10);
  }
  return cleaned;
}

function getTimestamp(meta = {}) {
  const updated = meta?.updatedAt;
  if (updated) {
    const parsed = Date.parse(updated);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  const created = meta?.created || meta?.createdAt;
  if (created) {
    const parsed = Date.parse(created);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return 0;
}
