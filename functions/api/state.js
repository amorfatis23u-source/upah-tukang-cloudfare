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

const encoder = new TextEncoder();
const MAX_VALUE_BYTES = 200 * 1024;
const MAX_META_BYTES = 1024;

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS
  });
}

export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const method = request.method.toUpperCase();
  const keyParam = url.searchParams.get('key');

  const { kv } = getKVBinding(env);
  if (!kv) {
    return json({ ok: false, error: 'KV binding UPAH_KV not found' }, 500);
  }

  if (method === 'OPTIONS') {
    return onRequestOptions();
  }

  try {
    if (method === 'GET') {
      if (!keyParam) {
        return json({ ok: false, error: 'key required' }, 400);
      }

      const result = await kv.getWithMetadata(keyParam, { type: 'json' });
      if (!result) {
        return json({ ok: false, error: 'Not found' }, 404);
      }

      const meta = normaliseStoredMeta(result.metadata);
      return json({ ok: true, key: keyParam, value: result.value ?? null, meta });
    }

    if (method === 'POST') {
      const payload = await readJsonSafe(request);
      const key = payload?.key || keyParam;
      if (!key) {
        return json({ ok: false, error: 'key required' }, 400);
      }

      const encodedValue = JSON.stringify(payload?.value ?? {});
      const valueSize = encoder.encode(encodedValue).byteLength;
      if (valueSize > MAX_VALUE_BYTES) {
        return json({ ok: false, error: 'Value too large' }, 413);
      }

      const incomingMeta = payload?.meta && typeof payload.meta === 'object' ? payload.meta : {};
      const preparedMeta = prepareMeta(incomingMeta);
      const metaSize = encoder.encode(JSON.stringify(preparedMeta)).byteLength;
      if (metaSize > MAX_META_BYTES) {
        return json({ ok: false, error: 'Meta too large' }, 413);
      }

      const existing = await kv.getWithMetadata(key);
      await kv.put(key, encodedValue, { metadata: preparedMeta });

      const statusCode = existing ? 200 : 201;
      return json({ ok: true, key, meta: preparedMeta }, statusCode);
    }

    if (method === 'DELETE') {
      if (!keyParam) {
        return json({ ok: false, error: 'key required' }, 400);
      }
      await kv.delete(keyParam);
      return json({ ok: true });
    }

    return json({ ok: false, error: 'Method not allowed' }, 405);
  } catch (err) {
    console.error('api/state error', err);
    return json({ ok: false, error: 'Internal Server Error' }, 500);
  }
}

async function readJsonSafe(request) {
  try {
    return await request.json();
  } catch (err) {
    return {};
  }
}

function prepareMeta(meta = {}) {
  const nowISO = new Date().toISOString();
  const base = { ...(meta && typeof meta === 'object' ? meta : {}) };

  const periodStart = toDateString(base.periodStart ?? base.start ?? base.period_start ?? '');
  const periodEnd = toDateString(base.periodEnd ?? base.end ?? base.period_end ?? '');
  const lokasi = toText(base.lokasi ?? base.rumah ?? base.location ?? '');
  const judul = toText(
    base.judul ||
      (lokasi && periodStart && periodEnd
        ? `${lokasi} (${periodStart} – ${periodEnd})`
        : periodStart && periodEnd
          ? `${periodStart} – ${periodEnd}`
          : lokasi || 'Snapshot')
  );

  return {
    ...base,
    periodStart: periodStart || null,
    periodEnd: periodEnd || null,
    lokasi: lokasi || null,
    judul,
    updatedAt: nowISO
  };
}

function normaliseStoredMeta(meta) {
  if (!meta || typeof meta !== 'object') {
    return {};
  }
  const cleaned = { ...meta };
  if (cleaned.periodStart && typeof cleaned.periodStart === 'string') {
    cleaned.periodStart = cleaned.periodStart;
  }
  if (cleaned.periodEnd && typeof cleaned.periodEnd === 'string') {
    cleaned.periodEnd = cleaned.periodEnd;
  }
  if (cleaned.lokasi && typeof cleaned.lokasi === 'string') {
    cleaned.lokasi = cleaned.lokasi;
  }
  if (cleaned.judul && typeof cleaned.judul === 'string') {
    cleaned.judul = cleaned.judul;
  }
  return cleaned;
}

function toDateString(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (!str) return '';
  return str.slice(0, 10);
}

function toText(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}
